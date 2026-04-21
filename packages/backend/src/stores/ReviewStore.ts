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
import { withClient } from "../utils/db";

const log = createLogger("ReviewStore");

export interface ReviewConfigRecord {
  id: string;
  tenantId: string;
  eventType: string;
  policy: string;
  requiredRole?: string;
  externalAdapterType?: string;
}

export interface SubmissionReviewRecord {
  id: string;
  submissionGuid: string;
  tenantId: string;
  status: string;
  submittedBy?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  eventType: string;
  entityGuid?: string;
  data?: unknown;
  createdAt?: Date;
}

export interface ReviewStore {
  initialize(): Promise<void>;
  getConfig(tenantId: string, eventType: string): Promise<ReviewConfigRecord | null>;
  getConfigsByTenant(tenantId: string): Promise<ReviewConfigRecord[]>;
  setConfig(tenantId: string, eventType: string, config: {
    policy: string;
    requiredRole?: string;
    externalAdapterType?: string;
  }): Promise<ReviewConfigRecord>;
  saveReview(review: SubmissionReviewRecord): Promise<void>;
  getReviewById(id: string): Promise<SubmissionReviewRecord | null>;
  getReviewsByTenant(tenantId: string, filters?: { status?: string }): Promise<SubmissionReviewRecord[]>;
  updateReviewStatus(id: string, updates: { status: string; reviewedBy: string; reviewedAt: Date; rejectionReason?: string }): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export class ReviewStoreImpl implements ReviewStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS review_configs (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          policy TEXT NOT NULL,
          required_role TEXT,
          external_adapter_type TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(tenant_id, event_type)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_review_configs_tenant_id
        ON review_configs (tenant_id)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS submission_reviews (
          id TEXT PRIMARY KEY,
          submission_guid TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          status TEXT NOT NULL,
          submitted_by TEXT NOT NULL,
          reviewed_by TEXT,
          reviewed_at TIMESTAMPTZ,
          rejection_reason TEXT,
          event_type TEXT NOT NULL,
          entity_guid TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_submission_reviews_tenant_id
        ON submission_reviews (tenant_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_submission_reviews_status
        ON submission_reviews (status)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_submission_reviews_tenant_status
        ON submission_reviews (tenant_id, status)
      `);
    });
    log.info("Review store initialized");
  }

  async getConfig(tenantId: string, eventType: string): Promise<ReviewConfigRecord | null> {
    return withClient(this.pool, async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, event_type, policy, required_role, external_adapter_type
         FROM review_configs
         WHERE tenant_id = $1 AND event_type = $2`,
        [tenantId, eventType],
      );
      if (result.rows.length === 0) return null;
      return this.mapRow(result.rows[0]);
    });
  }

  async getConfigsByTenant(tenantId: string): Promise<ReviewConfigRecord[]> {
    return withClient(this.pool, async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, event_type, policy, required_role, external_adapter_type
         FROM review_configs
         WHERE tenant_id = $1`,
        [tenantId],
      );
      return result.rows.map((row) => this.mapRow(row));
    });
  }

  async setConfig(
    tenantId: string,
    eventType: string,
    config: { policy: string; requiredRole?: string; externalAdapterType?: string },
  ): Promise<ReviewConfigRecord> {
    return withClient(this.pool, async (client) => {
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO review_configs (id, tenant_id, event_type, policy, required_role, external_adapter_type, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (tenant_id, event_type)
         DO UPDATE SET policy = $4, required_role = $5, external_adapter_type = $6, updated_at = NOW()
         RETURNING id, tenant_id, event_type, policy, required_role, external_adapter_type`,
        [id, tenantId, eventType, config.policy, config.requiredRole || null, config.externalAdapterType || null],
      );
      return this.mapRow(result.rows[0]);
    });
  }

  async saveReview(review: SubmissionReviewRecord): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(
        `INSERT INTO submission_reviews (id, submission_guid, tenant_id, status, submitted_by, reviewed_by, reviewed_at, rejection_reason, event_type, entity_guid, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          review.id,
          review.submissionGuid,
          review.tenantId,
          review.status,
          review.submittedBy || null,
          review.reviewedBy || null,
          review.reviewedAt || null,
          review.rejectionReason || null,
          review.eventType,
          review.entityGuid || null,
          review.data ? JSON.stringify(review.data) : "{}",
          review.createdAt || new Date(),
        ],
      );
    });
  }

  async getReviewById(id: string): Promise<SubmissionReviewRecord | null> {
    return withClient(this.pool, async (client) => {
      const result = await client.query(
        `SELECT id, submission_guid, tenant_id, status, submitted_by, reviewed_by, reviewed_at, rejection_reason, event_type, entity_guid, data, created_at
         FROM submission_reviews
         WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) return null;
      return this.mapReviewRow(result.rows[0]);
    });
  }

  async getReviewsByTenant(tenantId: string, filters?: { status?: string }): Promise<SubmissionReviewRecord[]> {
    return withClient(this.pool, async (client) => {
      let query = `SELECT id, submission_guid, tenant_id, status, submitted_by, reviewed_by, reviewed_at, rejection_reason, event_type, entity_guid, data, created_at
         FROM submission_reviews
         WHERE tenant_id = $1`;
      const params: unknown[] = [tenantId];

      if (filters?.status) {
        query += ` AND status = $2`;
        params.push(filters.status);
      }

      query += ` ORDER BY created_at ASC`;

      const result = await client.query(query, params);
      return result.rows.map((row) => this.mapReviewRow(row));
    });
  }

  async updateReviewStatus(id: string, updates: { status: string; reviewedBy: string; reviewedAt: Date; rejectionReason?: string }): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(
        `UPDATE submission_reviews
         SET status = $1, reviewed_by = $2, reviewed_at = $3, rejection_reason = $4
         WHERE id = $5`,
        [updates.status, updates.reviewedBy, updates.reviewedAt, updates.rejectionReason || null, id],
      );
    });
  }

  async clearStore(): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(`DELETE FROM review_configs`);
      await client.query(`DELETE FROM submission_reviews`);
    });
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  private mapRow(row: Record<string, unknown>): ReviewConfigRecord {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      eventType: row.event_type as string,
      policy: row.policy as string,
      requiredRole: (row.required_role as string) || undefined,
      externalAdapterType: (row.external_adapter_type as string) || undefined,
    };
  }

  private mapReviewRow(row: Record<string, unknown>): SubmissionReviewRecord {
    return {
      id: row.id as string,
      submissionGuid: row.submission_guid as string,
      tenantId: row.tenant_id as string,
      status: row.status as string,
      submittedBy: (row.submitted_by as string) || undefined,
      reviewedBy: (row.reviewed_by as string) || undefined,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string) : undefined,
      rejectionReason: (row.rejection_reason as string) || undefined,
      eventType: row.event_type as string,
      entityGuid: (row.entity_guid as string) || undefined,
      data: row.data as unknown,
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
    };
  }
}
