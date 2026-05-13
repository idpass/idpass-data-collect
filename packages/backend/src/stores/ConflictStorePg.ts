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

import type { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { conflicts } from "../db/schema";
import type { ConflictRecord, ConflictStore } from "@idpass/data-collect-core";

/**
 * PostgreSQL-backed implementation of {@link ConflictStore} for the backend.
 *
 * Tenant-scoped: every WHERE clause is filtered by `tenantId` to enforce
 * multi-tenant isolation. Mirrors the pattern used by
 * `PostgresEventStorageAdapter`/`PostgresEntityStorageAdapter` in core.
 *
 * Construct one instance per tenant. The pool is shared across instances and
 * is owned by the caller (matches `AppInstanceStore` semantics).
 */
export class ConflictStorePg implements ConflictStore {
  private db: NodePgDatabase;

  constructor(pool: Pool, private tenantId: string) {
    this.db = drizzle(pool);
  }

  /**
   * Replaces the internal Drizzle instance. Mirrors the pattern used by
   * `PostgresEventStorageAdapter` / `PostgresEntityStorageAdapter`: callers
   * inject a Drizzle transaction object so that conflict-record inserts
   * participate in an external transaction (e.g. the transactional /push
   * batch in `transactionalEdm.ts`). Without this, conflicts recorded during
   * a transactional batch would NOT roll back on transaction failure.
   *
   * @param db A Drizzle database or transaction instance.
   */
  setDrizzleInstance(db: NodePgDatabase): void {
    this.db = db;
  }

  /**
   * Persist a new conflict record. Idempotent on `guid` — if a record with the
   * same guid already exists, the insert is a no-op. This matches retry
   * semantics used by other stores in the codebase.
   */
  async saveConflict(record: ConflictRecord): Promise<void> {
    await this.db
      .insert(conflicts)
      .values({
        guid: record.guid,
        entityGuid: record.entityGuid,
        tenantId: record.tenantId,
        localVersion: record.localVersion,
        remoteVersion: record.remoteVersion,
        localEventGuid: record.localEventGuid,
        remoteEventGuid: record.remoteEventGuid,
        detectedAt: new Date(record.detectedAt),
        resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
        resolution: record.resolution,
        resolvedBy: record.resolvedBy,
        mergedData: record.mergedData,
      })
      .onConflictDoNothing({ target: conflicts.guid });
  }

  async getConflict(guid: string): Promise<ConflictRecord | null> {
    const rows = await this.db
      .select()
      .from(conflicts)
      .where(and(eq(conflicts.guid, guid), eq(conflicts.tenantId, this.tenantId)));
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async getUnresolvedConflicts(tenantId: string): Promise<ConflictRecord[]> {
    // Tenant-isolation guard: ignore mismatched param. The interface keeps
    // `tenantId` for API compatibility with implementations that aren't
    // pre-bound to a tenant (e.g. the in-memory store), but this adapter is
    // bound at construction.
    const tid = tenantId === this.tenantId ? tenantId : this.tenantId;
    const rows = await this.db
      .select()
      .from(conflicts)
      .where(and(eq(conflicts.tenantId, tid), isNull(conflicts.resolvedAt)))
      .orderBy(desc(conflicts.detectedAt));
    return rows.map((r) => this.toRecord(r));
  }

  async updateConflict(guid: string, updates: Partial<ConflictRecord>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (updates.resolvedAt !== undefined) {
      patch.resolvedAt = updates.resolvedAt ? new Date(updates.resolvedAt) : null;
    }
    if (updates.resolution !== undefined) patch.resolution = updates.resolution;
    if (updates.resolvedBy !== undefined) patch.resolvedBy = updates.resolvedBy;
    if (updates.mergedData !== undefined) patch.mergedData = updates.mergedData;
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(conflicts)
      .set(patch)
      .where(and(eq(conflicts.guid, guid), eq(conflicts.tenantId, this.tenantId)));
  }

  async getConflictCount(tenantId: string): Promise<number> {
    const tid = tenantId === this.tenantId ? tenantId : this.tenantId;
    const rows = await this.db
      .select({ n: count() })
      .from(conflicts)
      .where(and(eq(conflicts.tenantId, tid), isNull(conflicts.resolvedAt)));
    return Number(rows[0]?.n ?? 0);
  }

  private toRecord(row: typeof conflicts.$inferSelect): ConflictRecord {
    return {
      guid: row.guid,
      entityGuid: row.entityGuid,
      tenantId: row.tenantId,
      localVersion: row.localVersion as Record<string, unknown>,
      remoteVersion: row.remoteVersion as Record<string, unknown>,
      localEventGuid: row.localEventGuid,
      remoteEventGuid: row.remoteEventGuid,
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolution: (row.resolution as ConflictRecord["resolution"]) ?? null,
      resolvedBy: row.resolvedBy ?? null,
      mergedData: (row.mergedData as Record<string, unknown> | null) ?? null,
    };
  }
}
