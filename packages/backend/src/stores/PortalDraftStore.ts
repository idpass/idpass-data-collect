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
import { PortalDraft } from "../types/portal";

function mapRowToDraft(row: Record<string, unknown>): PortalDraft {
  return {
    id: row.id as string,
    beneficiaryAccountId: row.beneficiary_account_id as number,
    changeRequestType: row.change_request_type as string,
    formData: row.form_data as Record<string, unknown>,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class PortalDraftStoreImpl {
  private pool: Pool;

  constructor(connectionStringOrPool: string | Pool) {
    this.pool = typeof connectionStringOrPool === "string"
      ? new Pool({ connectionString: connectionStringOrPool })
      : connectionStringOrPool;
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS portal_drafts (
          id TEXT PRIMARY KEY,
          beneficiary_account_id INTEGER NOT NULL REFERENCES beneficiary_accounts(id) ON DELETE CASCADE,
          change_request_type TEXT NOT NULL,
          form_data JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_portal_drafts_account
          ON portal_drafts(beneficiary_account_id)
      `);
    } finally {
      client.release();
    }
  }

  async findByAccountId(beneficiaryAccountId: number): Promise<PortalDraft[]> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM portal_drafts WHERE beneficiary_account_id = $1 ORDER BY updated_at DESC",
        values: [beneficiaryAccountId],
      });
      return rows.map(mapRowToDraft);
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<PortalDraft | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM portal_drafts WHERE id = $1 LIMIT 1",
        values: [id],
      });
      if (rows.length === 0) {
        return null;
      }
      return mapRowToDraft(rows[0]);
    } finally {
      client.release();
    }
  }

  async upsert(
    id: string,
    beneficiaryAccountId: number,
    changeRequestType: string,
    formData: Record<string, unknown>,
  ): Promise<PortalDraft> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: `
          INSERT INTO portal_drafts
            (id, beneficiary_account_id, change_request_type, form_data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id)
          DO UPDATE SET
            form_data = EXCLUDED.form_data,
            updated_at = NOW()
          RETURNING *
        `,
        values: [id, beneficiaryAccountId, changeRequestType, JSON.stringify(formData)],
      });
      return mapRowToDraft(rows[0]);
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: "DELETE FROM portal_drafts WHERE id = $1",
        values: [id],
      });
    } finally {
      client.release();
    }
  }

  async deleteExpired(ttlDays: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      const { rowCount } = await client.query({
        text: "DELETE FROM portal_drafts WHERE updated_at < NOW() - ($1 || ' days')::INTERVAL",
        values: [ttlDays],
      });
      return rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("TRUNCATE TABLE portal_drafts");
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
