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
import { AppConfig, AppConfigStore } from "../types";

export class AppConfigStoreImpl implements AppConfigStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
  }

  async initialize(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS app_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        url TEXT,
        entity_forms JSONB NOT NULL,
        entity_data JSONB,
        external_sync JSONB
      );
    `;

    try {
      await this.pool.query(createTableQuery);
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  async getConfigs(): Promise<AppConfig[]> {
    const query = "SELECT * FROM app_configs";

    try {
      const result = await this.pool.query(query);
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        url: row.url,
        entityForms: row.entity_forms,
        entityData: row.entity_data,
        externalSync: row.external_sync,
      }));
    } catch (error) {
      throw new Error(`Failed to get configs: ${error}`);
    }
  }

  async getConfig(id: string): Promise<AppConfig> {
    const query = "SELECT * FROM app_configs WHERE id = $1";

    try {
      const result = await this.pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error(`Config with id ${id} not found`);
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        url: row.url,
        entityForms: row.entity_forms,
        entityData: row.entity_data,
        externalSync: row.external_sync,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      throw new Error(`Failed to get config: ${error}`);
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    const query = `
      INSERT INTO app_configs (
        id, name, description, version, url, entity_forms, entity_data, external_sync
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        url = EXCLUDED.url,
        entity_forms = EXCLUDED.entity_forms,
        entity_data = EXCLUDED.entity_data,
        external_sync = EXCLUDED.external_sync
    `;

    try {
      await this.pool.query(query, [
        config.id || undefined,
        config.name,
        config.description,
        config.version,
        config.url,
        JSON.stringify(config.entityForms),
        JSON.stringify(config.entityData),
        config.externalSync,
      ]);
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  async deleteConfig(id: string): Promise<void> {
    const query = "DELETE FROM app_configs WHERE id = $1";

    try {
      await this.pool.query(query, [id]);
    } catch (error) {
      throw new Error(`Failed to delete config: ${error}`);
    }
  }

  async clearStore(): Promise<void> {
    const query = "TRUNCATE TABLE app_configs CASCADE";

    try {
      await this.pool.query(query);
    } catch (error) {
      throw new Error(`Failed to clear store: ${error}`);
    }
  }

  async closeConnection(): Promise<void> {
    try {
      await this.pool.end();
    } catch (error) {
      throw new Error(`Failed to close connection: ${error}`);
    }
  }
}
