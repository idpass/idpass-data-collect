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

import { randomBytes } from "crypto";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppConfig, AppConfigStore } from "../types";
import { appConfigs } from "../db/schema";

type DrizzleDb = NodePgDatabase<Record<string, never>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppConfigRow = Record<string, any>;

/**
 * Maps a Drizzle row result to an AppConfig object.
 * Preserves null values from the database for backwards compatibility with existing tests.
 */
function mapRowToAppConfig(row: AppConfigRow, artifactId: string): AppConfig {
  return {
    id: row.id,
    artifactId,
    name: row.name,
    description: row.description,
    version: row.version,
    url: row.url,
    entityForms: row.entityForms,
    entityData: row.entityData,
    externalSync: row.externalSync,
    authConfigs: row.authConfigs,
  } as AppConfig;
}

export class AppConfigStoreImpl implements AppConfigStore {
  private pool: Pool;
  private db: DrizzleDb;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
    this.db = drizzle(this.pool);
  }

  async initialize(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS app_configs (
        id TEXT PRIMARY KEY,
        artifact_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        url TEXT,
        entity_forms JSONB NOT NULL,
        entity_data JSONB,
        external_sync JSONB,
        auth_configs JSONB
      );
    `;

    try {
      await this.pool.query(createTableQuery);
      await this.pool.query(`ALTER TABLE app_configs ADD COLUMN IF NOT EXISTS artifact_id TEXT`);
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  async getConfigs(): Promise<AppConfig[]> {
    try {
      const result = await this.db.select().from(appConfigs);
      return Promise.all(
        result.map(async (row) =>
          mapRowToAppConfig(row, await this.ensureArtifactId(row.id, row.artifactId)),
        ),
      );
    } catch (error) {
      throw new Error(`Failed to get configs: ${error}`);
    }
  }

  async getConfig(id: string): Promise<AppConfig> {
    try {
      const result = await this.db.select().from(appConfigs).where(eq(appConfigs.id, id));

      if (result.length === 0) {
        throw new Error(`Config with id ${id} not found`);
      }

      const row = result[0];
      return mapRowToAppConfig(row, await this.ensureArtifactId(row.id, row.artifactId));
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      throw new Error(`Failed to get config: ${error}`);
    }
  }

  async getConfigByArtifactId(artifactId: string): Promise<AppConfig> {
    try {
      const result = await this.db
        .select()
        .from(appConfigs)
        .where(eq(appConfigs.artifactId, artifactId));

      if (result.length === 0) {
        throw new Error(`Config with artifact id ${artifactId} not found`);
      }

      const row = result[0];
      return mapRowToAppConfig(row, await this.ensureArtifactId(row.id, row.artifactId));
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      throw new Error(`Failed to get config: ${error}`);
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    try {
      const artifactId = await this.ensureArtifactId(config.id, config.artifactId);
      const values = {
        id: config.id,
        artifactId,
        name: config.name,
        description: config.description ?? null,
        version: config.version ?? null,
        url: config.url ?? null,
        entityForms: JSON.stringify(config.entityForms),
        entityData: JSON.stringify(config.entityData),
        externalSync: config.externalSync ?? null,
        authConfigs: JSON.stringify(config.authConfigs),
      };
      await this.db
        .insert(appConfigs)
        .values(values)
        .onConflictDoUpdate({
          target: appConfigs.id,
          set: {
            artifactId,
            name: config.name,
            description: config.description ?? null,
            version: config.version ?? null,
            url: config.url ?? null,
            entityForms: JSON.stringify(config.entityForms),
            entityData: JSON.stringify(config.entityData),
            externalSync: config.externalSync ?? null,
            authConfigs: JSON.stringify(config.authConfigs),
          },
        });
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  async deleteConfig(id: string): Promise<void> {
    try {
      await this.db.delete(appConfigs).where(eq(appConfigs.id, id));
    } catch (error) {
      throw new Error(`Failed to delete config: ${error}`);
    }
  }

  async clearStore(): Promise<void> {
    try {
      await this.db.execute(sql`TRUNCATE TABLE app_configs CASCADE`);
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

  private async ensureArtifactId(id: string, artifactId?: string | null): Promise<string> {
    if (artifactId && artifactId.trim() !== "") {
      return artifactId;
    }

    const generated = randomBytes(16).toString("hex");
    await this.db
      .update(appConfigs)
      .set({ artifactId: generated })
      .where(eq(appConfigs.id, id));
    return generated;
  }
}
