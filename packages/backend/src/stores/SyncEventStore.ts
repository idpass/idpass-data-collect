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

import { Pool } from "pg";
import { createLogger } from "../utils/logger";

const log = createLogger("SyncEventStore");

export interface SyncEventInput {
  configId: string;
  status: "success" | "partial" | "failed";
  pushed: number;
  pulled: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errors: Array<{ entityGuid?: string; code: string; message: string }> | null;
  triggeredBy: string;
}

export interface SyncEventRecord {
  id: number;
  configId: string;
  status: string;
  pushed: number;
  pulled: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errors: Array<{ entityGuid?: string; code: string; message: string }> | null;
  triggeredBy: string;
  createdAt: string;
}

export class SyncEventStore {
  constructor(private pool: Pool) {}

  async insert(input: SyncEventInput): Promise<SyncEventRecord> {
    const result = await this.pool.query(
      `INSERT INTO sync_events (config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at`,
      [
        input.configId,
        input.status,
        input.pushed,
        input.pulled,
        input.failed,
        input.skipped,
        input.durationMs,
        input.errors ? JSON.stringify(input.errors) : null,
        input.triggeredBy,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async getByConfigId(configId: string, limit: number = 20): Promise<SyncEventRecord[]> {
    const result = await this.pool.query(
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at
       FROM sync_events
       WHERE config_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [configId, limit],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getLastByConfigId(configId: string): Promise<SyncEventRecord | null> {
    const result = await this.pool.query(
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at
       FROM sync_events
       WHERE config_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [configId],
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: Record<string, unknown>): SyncEventRecord {
    return {
      id: row.id as number,
      configId: row.config_id as string,
      status: row.status as string,
      pushed: row.pushed as number,
      pulled: row.pulled as number,
      failed: row.failed as number,
      skipped: row.skipped as number,
      durationMs: row.duration_ms as number,
      errors: row.errors as SyncEventRecord["errors"],
      triggeredBy: row.triggered_by as string,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }
}
