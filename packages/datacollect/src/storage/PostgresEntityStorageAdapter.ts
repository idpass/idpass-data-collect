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
import { EntityPair, EntityStorageAdapter, SearchCriteria } from "../interfaces/types";

/**
 * PostgreSQL implementation of the EntityStorageAdapter for server-side entity persistence.
 *
 * This adapter provides scalable, ACID-compliant entity storage using PostgreSQL with
 * advanced features like JSONB support, full-text search, and multi-tenant isolation.
 * It's designed for production server deployments requiring robust data persistence.
 *
 * Key features:
 * - **ACID Transactions**: Full PostgreSQL transaction support for data consistency
 * - **JSONB Storage**: Efficient JSON storage with native PostgreSQL indexing and querying
 * - **Multi-Tenant Support**: Complete tenant isolation using tenant_id partitioning
 * - **Advanced Search**: Rich query capabilities with JSONB operators and regex support
 * - **Connection Pooling**: Efficient connection management for high-concurrency scenarios
 * - **Scalable Architecture**: Designed for production workloads with proper indexing
 * - **Duplicate Detection**: Optimized duplicate tracking with compound primary keys
 *
 * Architecture:
 * - Uses PostgreSQL connection pooling for performance and scalability
 * - Stores entities as JSONB documents for flexible schema evolution
 * - Implements tenant isolation at the database level
 * - Provides optimized queries with proper indexing strategies
 * - Supports advanced search operations using PostgreSQL's JSONB capabilities
 *
 * Database Schema:
 * ```
 * -- Main entities table
 * CREATE TABLE entities (
 *   id TEXT,
 *   guid TEXT,
 *   initial JSONB,           -- Original entity state
 *   modified JSONB,          -- Current entity state
 *   sync_level TEXT,         -- Synchronization status
 *   last_updated TIMESTAMP,  -- Last modification timestamp
 *   tenant_id TEXT,          -- Tenant isolation
 *   PRIMARY KEY (id, tenant_id),
 *   UNIQUE (guid, tenant_id)
 * );
 *
 * -- Potential duplicates tracking
 * CREATE TABLE potential_duplicates (
 *   entity_guid TEXT,
 *   duplicate_guid TEXT,
 *   tenant_id TEXT,
 *   PRIMARY KEY (entity_guid, duplicate_guid, tenant_id)
 * );
 * ```
 *
 * @example
 * Basic server setup:
 * ```typescript
 * const adapter = new PostgresEntityStorageAdapter(
 *   'postgresql://user:pass@localhost:5432/datacollect',
 *   'tenant-123'
 * );
 *
 * await adapter.initialize();
 *
 * // Save an entity
 * const entityPair: EntityPair = {
 *   guid: 'person-456',
 *   initial: originalEntity,
 *   modified: updatedEntity
 * };
 * await adapter.saveEntity(entityPair);
 * ```
 *
 * @example
 * Advanced search with JSONB:
 * ```typescript
 * // Search for adults with complex criteria
 * const adults = await adapter.searchEntities([
 *   { "data.age": { $gte: 18 } },           // Age >= 18
 *   { "data.status": "active" },             // Exact string match
 *   { "data.name": { $regex: "john" } },     // Case-insensitive regex
 *   { "data.verified": true }                // Boolean match
 * ]);
 *
 * // Search with numeric ranges
 * const middleAged = await adapter.searchEntities([
 *   { "data.age": { $gte: 30 } },
 *   { "data.age": { $lte: 65 } }
 * ]);
 * ```
 *
 * @example
 * Multi-tenant deployment:
 * ```typescript
 * // Tenant-specific adapters
 * const orgAAdapter = new PostgresEntityStorageAdapter(connectionString, 'org-a');
 * const orgBAdapter = new PostgresEntityStorageAdapter(connectionString, 'org-b');
 *
 * // Each adapter operates on isolated data
 * await orgAAdapter.initialize();
 * await orgBAdapter.initialize();
 *
 * // Data is completely isolated between tenants
 * await orgAAdapter.saveEntity(entityForOrgA);
 * await orgBAdapter.saveEntity(entityForOrgB);
 * ```
 *
 * @example
 * Production connection configuration:
 * ```typescript
 * const adapter = new PostgresEntityStorageAdapter(
 *   'postgresql://datacollect_user:secure_pass@db.example.com:5432/datacollect_prod?sslmode=require',
 *   process.env.TENANT_ID
 * );
 *
 * // Initialize with proper error handling
 * try {
 *   await adapter.initialize();
 *   console.log('Database initialized successfully');
 * } catch (error) {
 *   console.error('Database initialization failed:', error);
 *   process.exit(1);
 * }
 * ```
 */
export class PostgresEntityStorageAdapter implements EntityStorageAdapter {
  private pool: Pool;
  private tenantId: string;

  /**
   * Creates a new PostgresEntityStorageAdapter instance.
   *
   * @param connectionString PostgreSQL connection string with credentials and database info.
   * @param tenantId Optional tenant identifier for multi-tenant isolation (defaults to "default").
   *
   * @example
   * ```typescript
   * // Local development
   * const adapter = new PostgresEntityStorageAdapter(
   *   'postgresql://user:pass@localhost:5432/datacollect_dev'
   * );
   *
   * // Production with tenant isolation
   * const prodAdapter = new PostgresEntityStorageAdapter(
   *   'postgresql://datacollect_user:secure_pass@db.prod.com:5432/datacollect?sslmode=require',
   *   'tenant-org-123'
   * );
   * ```
   */
  constructor(connectionString: string, tenantId?: string) {
    this.pool = new Pool({
      connectionString,
    });
    this.tenantId = tenantId || "default";
  }

  /**
   * Closes all connections in the PostgreSQL connection pool.
   *
   * Should be called during application shutdown to ensure graceful cleanup of database connections.
   *
   * @returns A Promise that resolves when the connection is closed.
   *
   * @example
   * ```typescript
   * // Application shutdown handler
   * process.on('SIGTERM', async () => {
   *   await adapter.closeConnection();
   *   console.log('Database connections closed');
   *   process.exit(0);
   * });
   * ```
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Initializes the PostgreSQL database with required tables and schemas.
   *
   * Creates `entities` table with JSONB storage, `potential_duplicates` table for duplicate detection,
   * and sets up proper indexing and constraints for multi-tenant isolation.
   *
   * This method is idempotent and safe to call multiple times.
   *
   * @returns A Promise that resolves when the database is successfully initialized.
   * @throws {Error} When database connection fails or table creation fails.
   *
   * @example
   * ```typescript
   * const adapter = new PostgresEntityStorageAdapter(connectionString, tenantId);
   *
   * try {
   *   await adapter.initialize();
   *   console.log('Database schema initialized');
   * } catch (error) {
   *   console.error('Failed to initialize database:', error);
   *   throw error;
   * }
   * ```
   */
  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT,
          guid TEXT,
          initial JSONB,
          modified JSONB,
          sync_level TEXT,
          last_updated TIMESTAMP,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          PRIMARY KEY (id, tenant_id),
          UNIQUE (guid, tenant_id)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS potential_duplicates (
          entity_guid TEXT,
          duplicate_guid TEXT,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          PRIMARY KEY (entity_guid, duplicate_guid, tenant_id)
        )
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all entity pairs for the current tenant.
   *
   * @returns A Promise that resolves with an array of `EntityPair` objects.
   * @throws {Error} If the database query fails.
   */
  async getAllEntities(): Promise<EntityPair[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("SELECT guid, initial, modified FROM entities WHERE tenant_id = $1", [
        this.tenantId,
      ]);
      return result.rows.map((row) => ({
        guid: row.guid,
        initial: row.initial,
        modified: row.modified,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Searches entities using advanced PostgreSQL JSONB query capabilities.
   *
   * Supports rich query operators optimized for PostgreSQL:
   * - `$gt`, `$gte`: Greater than, greater than or equal (numeric)
   * - `$lt`, `$lte`: Less than, less than or equal (numeric)
   * - `$eq`: Exact equality (numeric)
   * - `$regex`: Case-insensitive regex matching using PostgreSQL ~* operator
   * - String values: Case-insensitive exact matching
   * - Boolean values: Direct boolean comparison
   * - Numeric values: Exact numeric comparison
   *
   * All searches examine both initial and modified entity states for comprehensive results.
   *
   * @param criteria Array of search criteria objects.
   * @returns A Promise that resolves with an array of entity pairs matching all criteria.
   * @throws {Error} If the database query fails.
   *
   * @example
   * ```typescript
   * // Complex multi-criteria search
   * const results = await adapter.searchEntities([
   *   { "data.age": { $gte: 21 } },          // Adults over 21
   *   { "data.age": { $lt: 65 } },           // Under retirement age
   *   { "data.status": "active" },            // Active status
   *   { "data.name": { $regex: "smith" } },    // Name contains "smith"
   *   { "data.verified": true }               // Verified accounts
   * ]);
   *
   * // Geographic search
   * const localUsers = await adapter.searchEntities([
   *   { "data.address.city": "Boston" },
   *   { "data.address.state": "MA" }
   * ]);
   * ```
   */
  async searchEntities(criteria: SearchCriteria): Promise<EntityPair[]> {
    const client = await this.pool.connect();
    try {
      const conditions = criteria.map((criterion) => {
        const key = Object.keys(criterion)[0];
        const value = criterion[key];
        if (typeof value === "object") {
          const operator = Object.keys(value)[0];
          const operandValue = value[operator];
          switch (operator) {
            case "$gt":
              return `((initial->'data'->>'${key}')::numeric > ${operandValue} OR (modified->'data'->>'${key}')::numeric > ${operandValue})`;
            case "$lt":
              return `((initial->'data'->>'${key}')::numeric < ${operandValue} OR (modified->'data'->>'${key}')::numeric < ${operandValue})`;
            case "$eq":
              return `((initial->'data'->>'${key}')::numeric = ${operandValue} OR (modified->'data'->>'${key}')::numeric = ${operandValue})`;
            case "$gte":
              return `((initial->'data'->>'${key}')::numeric >= ${operandValue} OR (modified->'data'->>'${key}')::numeric >= ${operandValue})`;
            case "$lte":
              return `((initial->'data'->>'${key}')::numeric <= ${operandValue} OR (modified->'data'->>'${key}')::numeric <= ${operandValue})`;
            case "$regex":
              return `((initial->'data'->>'${key}') ~* '${operandValue}' OR (modified->'data'->>'${key}') ~* '${operandValue}')`;
            default:
              return "false";
          }
        } else if (typeof value === "boolean") {
          return `((initial->'data'->>'${key}')::boolean = ${value} OR (modified->'data'->>'${key}')::boolean = ${value})`;
        } else if (typeof value === "number") {
          return `((initial->'data'->>'${key}')::numeric = ${value} OR (modified->'data'->>'${key}')::numeric = ${value})`;
        } else if (typeof value === "string") {
          return `(LOWER(initial->'data'->>'${key}') = LOWER('${value}') OR LOWER(modified->'data'->>'${key}') = LOWER('${value}'))`;
        } else {
          return `(LOWER(initial->'data'->>'${key}') = LOWER('${value}') OR LOWER(modified->'data'->>'${key}') = LOWER('${value}'))`;
        }
      });

      const query = `SELECT guid, initial, modified FROM entities WHERE tenant_id = $1 AND ${conditions.join(" AND ")}`;
      const result = await client.query(query, [this.tenantId]);
      return result.rows.map((row) => ({
        guid: row.guid,
        initial: row.initial,
        modified: row.modified,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Saves an `EntityPair` to the entity store.
   *
   * If an entity with the same GUID and tenant ID already exists, it will be updated.
   *
   * @param entity The `EntityPair` object to save.
   * @returns A Promise that resolves when the entity is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async saveEntity(entity: EntityPair): Promise<void> {
    const client = await this.pool.connect();
    try {
      const guid = entity.initial.guid || entity.modified.guid;
      await client.query(
        "INSERT INTO entities (id, guid, initial, modified, last_updated, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) " +
          "ON CONFLICT (guid, tenant_id) DO UPDATE SET initial = $3, modified = $4, last_updated = $5",
        [guid, guid, entity.initial, entity.modified, entity.modified.lastUpdated, this.tenantId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves an entity by its internal ID.
   *
   * @param id The internal ID of the entity.
   * @returns A Promise that resolves with the `EntityPair` if found, or `null` otherwise.
   * @throws {Error} If the database query fails.
   */
  async getEntity(id: string): Promise<EntityPair | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, initial, modified FROM entities WHERE id = $1 AND tenant_id = $2",
        [id, this.tenantId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        guid: row.guid,
        initial: row.initial,
        modified: row.modified,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all entity data. This is an alias for `getAllEntities`.
   *
   * @returns A Promise that resolves with an array of all `EntityPair` objects.
   * @throws {Error} If the database query fails.
   */
  async getAllEntityData(): Promise<EntityPair[]> {
    return this.getAllEntities();
  }

  /**
   * Retrieves entities that have been modified since a specific timestamp.
   *
   * @param timestamp The ISO 8601 timestamp string from which to retrieve modified entities.
   * @returns A Promise that resolves with an array of `EntityPair` objects modified after the timestamp.
   * @throws {Error} If the database query fails.
   */
  async getModifiedEntitiesSince(timestamp: string): Promise<EntityPair[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, initial, modified FROM entities WHERE tenant_id = $1 AND last_updated > $2",
        [this.tenantId, timestamp],
      );
      return result.rows.map((row) => ({
        guid: row.guid,
        initial: row.initial,
        modified: row.modified,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Marks an entity as synced by updating its `sync_level` to "SYNCED" and `last_updated` timestamp.
   *
   * @param id The internal ID of the entity to mark as synced.
   * @returns A Promise that resolves when the entity's sync status is updated.
   * @throws {Error} If the database update fails.
   */
  async markEntityAsSynced(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE entities SET sync_level = $1, last_updated = $2 WHERE id = $3 AND tenant_id = $4", [
        "SYNCED",
        new Date().toISOString(),
        id,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Deletes an entity from the store by its internal ID.
   *
   * Also deletes any associated potential duplicate records.
   *
   * @param id The internal ID of the entity to delete.
   * @returns A Promise that resolves when the entity and its duplicates are deleted.
   * @throws {Error} If the database deletion fails.
   */
  async deleteEntity(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM entities WHERE id = $1 AND tenant_id = $2", [id, this.tenantId]);
      await client.query(
        "DELETE FROM potential_duplicates WHERE (entity_guid = $1 OR duplicate_guid = $1) AND tenant_id = $2",
        [id, this.tenantId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves an entity by its external ID.
   *
   * Searches both `initial` and `modified` states for the `externalId` field.
   *
   * @param externalId The external ID of the entity to retrieve.
   * @returns A Promise that resolves with the `EntityPair` if found, or `null` otherwise.
   * @throws {Error} If the database query fails.
   */
  async getEntityByExternalId(externalId: string): Promise<EntityPair | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, initial, modified FROM entities WHERE (initial->>'externalId' = $1 OR modified->>'externalId' = $1) AND tenant_id = $2",
        [externalId, this.tenantId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        guid: row.guid,
        initial: row.initial,
        modified: row.modified,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Sets or updates the `externalId` for an entity.
   *
   * Updates the `externalId` within the `modified` JSONB data of the entity.
   *
   * @param guid The GUID of the entity to update.
   * @param externalId The new external ID to set.
   * @returns A Promise that resolves when the `externalId` is successfully set.
   * @throws {Error} If the database update fails.
   */
  async setExternalId(guid: string, externalId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE entities
         SET modified = jsonb_set(modified, '{data,externalId}', to_jsonb($1), true)
         WHERE guid = $2`,
        [externalId, guid],
      );
    } catch (error) {
      console.error("Error setting externalId:", error);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all potential duplicate entity pairs for the current tenant.
   *
   * @returns A Promise that resolves with an array of objects containing `entityGuid` and `duplicateGuid`.
   * @throws {Error} If the database query fails.
   */
  async getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT entity_guid, duplicate_guid FROM potential_duplicates WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows.map((row) => ({
        entityGuid: row.entity_guid,
        duplicateGuid: row.duplicate_guid,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Saves an array of potential duplicate entity pairs.
   *
   * Uses `ON CONFLICT DO NOTHING` to prevent duplicate entries if a pair already exists.
   *
   * @param duplicates An array of objects, each containing `entityGuid` and `duplicateGuid`.
   * @returns A Promise that resolves when the potential duplicates are saved.
   * @throws {Error} If the database transaction fails.
   */
  async savePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const duplicate of duplicates) {
        await client.query(
          "INSERT INTO potential_duplicates (entity_guid, duplicate_guid, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [duplicate.entityGuid, duplicate.duplicateGuid, this.tenantId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolves (deletes) an array of potential duplicate entity pairs.
   *
   * @param duplicates An array of objects, each containing `entityGuid` and `duplicateGuid` of the duplicates to resolve.
   * @returns A Promise that resolves when the potential duplicates are removed.
   * @throws {Error} If the database deletion fails.
   */
  async resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "DELETE FROM potential_duplicates WHERE entity_guid = $1 AND duplicate_guid = $2 AND tenant_id = $3",
        [duplicates[0].entityGuid, duplicates[0].duplicateGuid, this.tenantId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Clears all entities and potential duplicates for the current tenant from the store.
   *
   * @returns A Promise that resolves when all data is cleared.
   * @throws {Error} If the database deletion fails.
   */
  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM entities WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM potential_duplicates WHERE tenant_id = $1", [this.tenantId]);
    } finally {
      client.release();
    }
  }
}
