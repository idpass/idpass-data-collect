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

const log = createLogger("ReviewStore");

export interface ReviewConfigRecord {
  id: string;
  tenantId: string;
  eventType: string;
  policy: string;
  requiredRole?: string;
  externalAdapterType?: string;
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
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export class ReviewStoreImpl implements ReviewStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
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
    } finally {
      client.release();
    }
    log.info("Review store initialized");
  }

  async getConfig(tenantId: string, eventType: string): Promise<ReviewConfigRecord | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, tenant_id, event_type, policy, required_role, external_adapter_type
         FROM review_configs
         WHERE tenant_id = $1 AND event_type = $2`,
        [tenantId, eventType],
      );
      if (result.rows.length === 0) return null;
      return this.mapRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getConfigsByTenant(tenantId: string): Promise<ReviewConfigRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, tenant_id, event_type, policy, required_role, external_adapter_type
         FROM review_configs
         WHERE tenant_id = $1`,
        [tenantId],
      );
      return result.rows.map((row) => this.mapRow(row));
    } finally {
      client.release();
    }
  }

  async setConfig(
    tenantId: string,
    eventType: string,
    config: { policy: string; requiredRole?: string; externalAdapterType?: string },
  ): Promise<ReviewConfigRecord> {
    const client = await this.pool.connect();
    try {
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
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`DELETE FROM review_configs`);
    } finally {
      client.release();
    }
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
}
