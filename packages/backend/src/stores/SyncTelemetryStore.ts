/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { deviceSyncSummary, syncActivity } from "@idpass/data-collect-core";

export interface RecordSyncInput {
  tenantId: string;
  userId: string;
  deviceId: string;
  eventCount: number;
  scopeHash: string | null;
}

export interface DeviceSyncSummaryRow {
  tenantId: string;
  userId: string;
  deviceId: string;
  lastPullAt: Date | null;
  lastPushAt: Date | null;
  totalPulled: number;
  totalPushed: number;
  lastScopeHash: string | null;
}

/**
 * Persistence layer for per-device sync telemetry (OpenProject WP #947).
 *
 * Backs the admin "Devices" view and per-device sync history. Writes are
 * fire-and-forget from the sync routes — they MUST NOT block sync if the
 * telemetry tables are unavailable (callers handle errors).
 *
 * Tenant isolation is enforced by including `tenant_id` in every read
 * predicate. Both tables are observability-only — they do not gate sync
 * delivery or scope enforcement.
 */
export class SyncTelemetryStore {
  private readonly db: NodePgDatabase;
  private readonly pool: Pool;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(pool: Pool) {
    this.pool = pool;
    this.db = drizzle(pool);
  }

  /**
   * Create the telemetry tables if they don't already exist by replaying the
   * canonical drizzle migration SQL. Single source of truth — if the schema
   * evolves, only the .sql file needs updating, not this code.
   *
   * Must be called once at server startup (before any sync routes are
   * served). Idempotent — the migration uses `CREATE TABLE IF NOT EXISTS`.
   *
   * Replaying SQL here (rather than relying on `drizzle-kit migrate`) keeps
   * the dev `compose down -v` workflow self-healing: the first request after
   * a volume wipe always finds the tables present.
   */
  async initialize(): Promise<void> {
    const sqlText = readFileSync(SyncTelemetryStore.migrationPath(), "utf8");
    await this.pool.query(sqlText);
  }

  /**
   * Resolve the path to the canonical telemetry migration SQL. Uses
   * `require.resolve` (CJS-native) to find the data-collect-core package
   * root, then locates the migration relative to it. Works for both the
   * development setup (workspace symlink) and a published install
   * (node_modules/@idpass/data-collect-core).
   */
  private static migrationPath(): string {
    const fromCore = require.resolve("@idpass/data-collect-core/package.json");
    // .../packages/datacollect/package.json  →  .../packages/datacollect/drizzle/0001_…sql
    return resolve(dirname(fromCore), "drizzle/0001_add_sync_telemetry.sql");
  }

  /**
   * Record a successful pull: upsert the device summary and append an
   * activity row. Increments `total_pulled` and bumps `last_pull_at`.
   */
  async recordPull(input: RecordSyncInput): Promise<void> {
    const p = (async () => {
      await this.upsertSummary(input, "pull");
      await this.appendActivity(input, "pull");
    })();
    this.track(p);
    return p;
  }

  /**
   * Record a successful push: upsert the device summary and append an
   * activity row. Increments `total_pushed` and bumps `last_push_at`.
   */
  async recordPush(input: RecordSyncInput): Promise<void> {
    const p = (async () => {
      await this.upsertSummary(input, "push");
      await this.appendActivity(input, "push");
    })();
    this.track(p);
    return p;
  }

  /**
   * Resolve when every in-flight `recordPull`/`recordPush` has completed.
   * Intended for tests that need deterministic ordering after a fire-and-forget
   * call from a request handler.
   */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled(Array.from(this.pending));
    }
  }

  private track(promise: Promise<unknown>): void {
    this.pending.add(promise);
    // Attach a no-op .catch() to the internal tracking reference so Node.js
    // does not flag this chain as an unhandled rejection. The outer callers
    // (sync routes) attach their own .catch() to the same promise returned
    // by recordPull/recordPush, so errors are always surfaced there; the
    // suppression here only prevents the process from crashing on
    // unhandledRejection when the telemetry table is temporarily unavailable
    // (e.g. first boot after compose down -v before initialize() has run).
    promise.catch(() => {}).finally(() => {
      this.pending.delete(promise);
    });
  }

  /**
   * List every device summary for a tenant. Used by the admin Devices
   * view. Tenant filter is mandatory — callers cannot list across tenants.
   */
  async listSummariesForTenant(tenantId: string): Promise<DeviceSyncSummaryRow[]> {
    return this.db
      .select()
      .from(deviceSyncSummary)
      .where(eq(deviceSyncSummary.tenantId, tenantId));
  }

  private async upsertSummary(
    input: RecordSyncInput,
    route: "pull" | "push",
  ): Promise<void> {
    const isPull = route === "pull";
    await this.db
      .insert(deviceSyncSummary)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        deviceId: input.deviceId,
        lastPullAt: isPull ? new Date() : null,
        lastPushAt: isPull ? null : new Date(),
        totalPulled: isPull ? input.eventCount : 0,
        totalPushed: isPull ? 0 : input.eventCount,
        lastScopeHash: input.scopeHash,
      })
      .onConflictDoUpdate({
        target: [
          deviceSyncSummary.tenantId,
          deviceSyncSummary.userId,
          deviceSyncSummary.deviceId,
        ],
        set: {
          lastPullAt: isPull ? sql`now()` : sql`${deviceSyncSummary.lastPullAt}`,
          lastPushAt: isPull ? sql`${deviceSyncSummary.lastPushAt}` : sql`now()`,
          totalPulled: isPull
            ? sql`${deviceSyncSummary.totalPulled} + ${input.eventCount}`
            : sql`${deviceSyncSummary.totalPulled}`,
          totalPushed: isPull
            ? sql`${deviceSyncSummary.totalPushed}`
            : sql`${deviceSyncSummary.totalPushed} + ${input.eventCount}`,
          lastScopeHash: input.scopeHash,
        },
      });
  }

  private async appendActivity(
    input: RecordSyncInput,
    route: "pull" | "push",
  ): Promise<void> {
    await this.db.insert(syncActivity).values({
      tenantId: input.tenantId,
      userId: input.userId,
      deviceId: input.deviceId,
      route,
      eventCount: input.eventCount,
      scopeHash: input.scopeHash,
    });
  }
}
