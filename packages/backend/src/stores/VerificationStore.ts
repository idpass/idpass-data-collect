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
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../utils/logger";

const log = createLogger("VerificationStore");

export interface Verification {
  id: string;
  submissionGuid: string;
  entityGuid: string;
  tenantId: string;
  status: "pending" | "verified" | "rejected" | "flagged";
  duplicateCheckResult: Record<string, unknown> | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

export interface VerificationStore {
  initialize(): Promise<void>;
  createVerification(
    submissionGuid: string,
    entityGuid: string,
    tenantId: string,
  ): Promise<Verification>;
  getVerification(submissionGuid: string): Promise<Verification | null>;
  getVerificationsByTenant(tenantId: string): Promise<Verification[]>;
  updateVerification(
    submissionGuid: string,
    status: Verification["status"],
    verifiedBy: string,
    notes: string,
    duplicateCheckResult?: Record<string, unknown>,
  ): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export class VerificationStoreImpl implements VerificationStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS verifications (
          id TEXT PRIMARY KEY,
          submission_guid TEXT NOT NULL,
          entity_guid TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          duplicate_check_result JSONB,
          verified_by TEXT,
          verified_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_verifications_submission_guid
        ON verifications (submission_guid)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_verifications_tenant_id
        ON verifications (tenant_id)
      `);
    } finally {
      client.release();
    }
    log.info("Verification store initialized");
  }

  async createVerification(
    submissionGuid: string,
    entityGuid: string,
    tenantId: string,
  ): Promise<Verification> {
    const id = uuidv4();
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO verifications (id, submission_guid, entity_guid, tenant_id, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [id, submissionGuid, entityGuid, tenantId],
      );
    } finally {
      client.release();
    }

    return {
      id,
      submissionGuid,
      entityGuid,
      tenantId,
      status: "pending",
      duplicateCheckResult: null,
      verifiedBy: null,
      verifiedAt: null,
      notes: null,
      createdAt: new Date(),
    };
  }

  async getVerification(submissionGuid: string): Promise<Verification | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, submission_guid, entity_guid, tenant_id, status,
                duplicate_check_result, verified_by, verified_at, notes, created_at
         FROM verifications WHERE submission_guid = $1`,
        [submissionGuid],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getVerificationsByTenant(tenantId: string): Promise<Verification[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, submission_guid, entity_guid, tenant_id, status,
                duplicate_check_result, verified_by, verified_at, notes, created_at
         FROM verifications WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId],
      );

      return result.rows.map(this.mapRow);
    } finally {
      client.release();
    }
  }

  async updateVerification(
    submissionGuid: string,
    status: Verification["status"],
    verifiedBy: string,
    notes: string,
    duplicateCheckResult?: Record<string, unknown>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE verifications
         SET status = $1, verified_by = $2, verified_at = NOW(), notes = $3,
             duplicate_check_result = COALESCE($4, duplicate_check_result)
         WHERE submission_guid = $5`,
        [status, verifiedBy, notes, duplicateCheckResult ? JSON.stringify(duplicateCheckResult) : null, submissionGuid],
      );
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`DELETE FROM verifications`);
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  private mapRow(row: Record<string, unknown>): Verification {
    return {
      id: row.id as string,
      submissionGuid: row.submission_guid as string,
      entityGuid: row.entity_guid as string,
      tenantId: row.tenant_id as string,
      status: row.status as Verification["status"],
      duplicateCheckResult: row.duplicate_check_result as Record<string, unknown> | null,
      verifiedBy: row.verified_by as string | null,
      verifiedAt: row.verified_at ? new Date(row.verified_at as string) : null,
      notes: row.notes as string | null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
