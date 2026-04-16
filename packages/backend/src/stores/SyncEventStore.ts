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
  jobId: string | null;
  phase: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  errorMessage: string | null;
}

export class SyncEventStore {
  constructor(private pool: Pool) {}

  async insert(input: SyncEventInput): Promise<SyncEventRecord> {
    const result = await this.pool.query(
      `INSERT INTO sync_events (config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message`,
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
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message
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
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message
       FROM sync_events
       WHERE config_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [configId],
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async insertJob(input: SyncEventInput & { jobId: string }): Promise<SyncEventRecord> {
    const result = await this.pool.query(
      `INSERT INTO sync_events (config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, job_id, phase)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message`,
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
        input.jobId,
        "pending",
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async updateJobProgress(
    jobId: string,
    updates: {
      phase?: string;
      pushed?: number;
      pulled?: number;
      failed?: number;
      skipped?: number;
    },
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.phase !== undefined) {
      setClauses.push(`phase = $${paramIndex++}`);
      values.push(updates.phase);
    }
    if (updates.pushed !== undefined) {
      setClauses.push(`pushed = $${paramIndex++}`);
      values.push(updates.pushed);
    }
    if (updates.pulled !== undefined) {
      setClauses.push(`pulled = $${paramIndex++}`);
      values.push(updates.pulled);
    }
    if (updates.failed !== undefined) {
      setClauses.push(`failed = $${paramIndex++}`);
      values.push(updates.failed);
    }
    if (updates.skipped !== undefined) {
      setClauses.push(`skipped = $${paramIndex++}`);
      values.push(updates.skipped);
    }

    values.push(jobId);
    await this.pool.query(
      `UPDATE sync_events SET ${setClauses.join(", ")} WHERE job_id = $${paramIndex}`,
      values,
    );
  }

  async completeJob(
    jobId: string,
    updates: {
      status: string;
      phase: string;
      pushed: number;
      pulled: number;
      failed: number;
      skipped: number;
      durationMs: number;
      errors: Array<{ entityGuid?: string; code: string; message: string }> | null;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sync_events SET
        status = $1, phase = $2, pushed = $3, pulled = $4, failed = $5,
        skipped = $6, duration_ms = $7, errors = $8, error_message = $9, updated_at = NOW()
       WHERE job_id = $10`,
      [
        updates.status,
        updates.phase,
        updates.pushed,
        updates.pulled,
        updates.failed,
        updates.skipped,
        updates.durationMs,
        updates.errors ? JSON.stringify(updates.errors) : null,
        updates.errorMessage || null,
        jobId,
      ],
    );
  }

  async getByJobId(jobId: string): Promise<SyncEventRecord | null> {
    const result = await this.pool.query(
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message
       FROM sync_events
       WHERE job_id = $1`,
      [jobId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async getActiveJobByConfigId(configId: string): Promise<SyncEventRecord | null> {
    const result = await this.pool.query(
      `SELECT id, config_id, status, pushed, pulled, failed, skipped, duration_ms, errors, triggered_by, created_at, job_id, phase, started_at, updated_at, error_message
       FROM sync_events
       WHERE config_id = $1 AND phase IS NOT NULL AND phase NOT IN ('completed', 'failed', 'cancelled')
       ORDER BY created_at DESC
       LIMIT 1`,
      [configId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async markJobStarted(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sync_events SET phase = 'pulling', started_at = NOW(), updated_at = NOW() WHERE job_id = $1`,
      [jobId],
    );
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
      jobId: (row.job_id as string) || null,
      phase: (row.phase as string) || null,
      startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
      updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : null,
      errorMessage: (row.error_message as string) || null,
    };
  }
}
