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
import { PortalFormConfig } from "../types/portal";

function mapRowToFormConfig(row: Record<string, unknown>): PortalFormConfig {
  return {
    id: row.id as number,
    appConfigId: row.app_config_id as string,
    changeRequestType: row.change_request_type as string,
    formioSchema: row.formio_schema as Record<string, unknown>,
    sourceJsonSchemaHash: (row.source_json_schema_hash as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class PortalFormConfigStoreImpl {
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
        CREATE TABLE IF NOT EXISTS portal_form_configs (
          id SERIAL PRIMARY KEY,
          app_config_id TEXT NOT NULL,
          change_request_type TEXT NOT NULL,
          formio_schema JSONB NOT NULL,
          source_json_schema_hash TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(app_config_id, change_request_type)
        )
      `);
    } finally {
      client.release();
    }
  }

  async findAll(appConfigId: string): Promise<PortalFormConfig[]> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM portal_form_configs WHERE app_config_id = $1",
        values: [appConfigId],
      });
      return rows.map(mapRowToFormConfig);
    } finally {
      client.release();
    }
  }

  async findByType(appConfigId: string, changeRequestType: string): Promise<PortalFormConfig | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM portal_form_configs WHERE app_config_id = $1 AND change_request_type = $2 LIMIT 1",
        values: [appConfigId, changeRequestType],
      });
      if (rows.length === 0) {
        return null;
      }
      return mapRowToFormConfig(rows[0]);
    } finally {
      client.release();
    }
  }

  async upsert(
    appConfigId: string,
    changeRequestType: string,
    formioSchema: Record<string, unknown>,
    sourceJsonSchemaHash: string | null,
  ): Promise<PortalFormConfig> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: `
          INSERT INTO portal_form_configs
            (app_config_id, change_request_type, formio_schema, source_json_schema_hash)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (app_config_id, change_request_type)
          DO UPDATE SET
            formio_schema = EXCLUDED.formio_schema,
            source_json_schema_hash = EXCLUDED.source_json_schema_hash,
            updated_at = NOW()
          RETURNING *
        `,
        values: [appConfigId, changeRequestType, JSON.stringify(formioSchema), sourceJsonSchemaHash],
      });
      return mapRowToFormConfig(rows[0]);
    } finally {
      client.release();
    }
  }

  async delete(appConfigId: string, changeRequestType: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: "DELETE FROM portal_form_configs WHERE app_config_id = $1 AND change_request_type = $2",
        values: [appConfigId, changeRequestType],
      });
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("TRUNCATE TABLE portal_form_configs");
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
