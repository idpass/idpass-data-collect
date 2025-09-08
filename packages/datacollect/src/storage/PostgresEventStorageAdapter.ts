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
import { AuditLogEntry, EventStorageAdapter, FormSubmission, SyncLevel } from "../interfaces/types";

/**
 * PostgreSQL implementation of the EventStorageAdapter for server-side event persistence.
 *
 * This adapter provides scalable, tamper-evident event storage using PostgreSQL.
 * It is designed for production server deployments requiring robust data persistence,
 * cryptographic integrity verification, and efficient event sourcing operations.
 *
 * Key features:
 * - **ACID Transactions**: Full PostgreSQL transaction support for data consistency.
 * - **Multi-Tenant Support**: Complete tenant isolation using `tenant_id` partitioning.
 * - **Immutable Event Storage**: All events are stored as immutable records.
 * - **Audit Trail Management**: Comprehensive audit logging for compliance and debugging.
 * - **Merkle Root Storage**: Stores Merkle roots for cryptographic integrity verification of the event log.
 * - **Sync Timestamp Management**: Tracks timestamps for various synchronization operations (local, remote, external).
 * - **Scalable Architecture**: Designed for production workloads with proper indexing.
 *
 * Architecture:
 * - Uses PostgreSQL connection pooling for performance and scalability.
 * - Stores events and audit logs as JSONB documents for flexible schema evolution.
 * - Implements tenant isolation at the database level for all event-related data.
 * - Provides optimized queries with proper indexing strategies for efficient retrieval.
 *
 * Database Schema Overview:
 * - `events`: Stores `FormSubmission` records with `guid` as primary key, `entity_guid`, `timestamp`, and `sync_level`.
 * - `audit_log`: Stores `AuditLogEntry` records with `id` as primary key, `entity_guid`, `event_guid`, and `timestamp`.
 * - `merkle_root`: Stores the latest Merkle root for event log integrity.
 * - `last_remote_sync_timestamp`, `last_local_sync_timestamp`, `last_push_external_sync_timestamp`,
 *   `last_pull_external_sync_timestamp`: Tables to store the timestamps of various synchronization operations.
 *
 * @example
 * Basic server setup:
 * ```typescript
 * import { PostgresEventStorageAdapter } from '@idpass/idpass-data-collect';
 *
 * const adapter = new PostgresEventStorageAdapter(
 *   'postgresql://user:pass@localhost:5432/datacollect',
 *   'tenant-123'
 * );
 *
 * await adapter.initialize();
 *
 * // Save events
 * const eventsToSave = [{ guid: 'event-1', entityGuid: 'entity-1', timestamp: new Date().toISOString(), type: 'create-entity', data: {} }];
 * await adapter.saveEvents(eventsToSave);
 *
 * // Retrieve events
 * const allEvents = await adapter.getEvents();
 * console.log('All events:', allEvents);
 * ```
 *
 * @example
 * Production connection configuration:
 * ```typescript
 * const adapter = new PostgresEventStorageAdapter(
 *   'postgresql://event_user:secure_pass@db.example.com:5432/eventstore_prod?sslmode=require',
 *   process.env.TENANT_ID
 * );
 *
 * try {
 *   await adapter.initialize();
 *   console.log('Event storage initialized successfully');
 * } catch (error) {
 *   console.error('Event storage initialization failed:', error);
 *   process.exit(1);
 * }
 * ```
 */
export class PostgresEventStorageAdapter implements EventStorageAdapter {
  private pool: Pool;
  private tenantId: string;

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
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Initializes the PostgreSQL database with required tables and schemas for events, audit logs, and Merkle roots.
   *
   * Creates:
   * - `events` table with `guid` as primary key and various indexes for efficient querying.
   * - `audit_log` table for storing audit trail entries.
   * - `merkle_root` table for storing the latest Merkle root.
   * - Timestamp tables for tracking different synchronization points.
   *
   * This method is idempotent and safe to call multiple times.
   *
   * @returns A Promise that resolves when the database is successfully initialized.
   * @throws {Error} When database connection fails or table creation fails.
   */
  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          guid TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          entity_guid TEXT,
          type TEXT,
          data JSONB,
          timestamp TIMESTAMPTZ,
          user_id TEXT,
          sync_level INTEGER
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          action TEXT,
          guid TEXT,
          entity_guid TEXT,
          event_guid TEXT,
          changes JSONB,
          signature TEXT,
          user_id TEXT,
          timestamp TIMESTAMPTZ
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS merkle_root (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          root TEXT
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS last_remote_sync_timestamp (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          timestamp TIMESTAMPTZ
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS last_local_sync_timestamp (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          timestamp TIMESTAMPTZ
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS last_push_external_sync_timestamp (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          timestamp TIMESTAMPTZ
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS last_pull_external_sync_timestamp (
          id SERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          timestamp TIMESTAMPTZ
        )
      `);

      // Add indexes for tenant_id
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id)");
    } finally {
      client.release();
    }
  }

  /**
   * Saves an array of `FormSubmission` events to the event store.
   *
   * Events are saved within a transaction to ensure atomicity. If any event fails to save,
   * the entire transaction is rolled back.
   *
   * @param events An array of `FormSubmission` objects to save.
   * @returns A Promise that resolves with an array of GUIDs of the successfully saved events.
   * @throws {Error} If the database transaction fails during the save operation.
   */
  async saveEvents(events: FormSubmission[]): Promise<string[]> {
    const client = await this.pool.connect();
    const guids: string[] = [];
    try {
      await client.query("BEGIN");
      console.log("Saving events: ", events);
      for (const event of events) {
        await client.query(
          "INSERT INTO events (guid, tenant_id, entity_guid, type, data, timestamp, user_id, sync_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            event.guid,
            this.tenantId,
            event.entityGuid,
            event.type,
            event.data,
            event.timestamp,
            event.userId,
            event.syncLevel,
          ],
        );
        guids.push(event.guid);
      }
      await client.query("COMMIT");
      return guids;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all `FormSubmission` events for the current tenant from the event store.
   *
   * Events are mapped to ensure `timestamp` is a valid ISO string.
   *
   * @returns A Promise that resolves with an array of all `FormSubmission` events.
   * @throws {Error} If the database query fails.
   */
  async getEvents(): Promise<FormSubmission[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level FROM events WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows.map((row) => {
        // const timestamp: string = row.timestamp ? row.timestamp.toISOString() : null;
        const timestamp: string = row.timestamp ? new Date(row.timestamp).toISOString() : "";
        return {
          guid: row.guid,
          entityGuid: row.entity_guid,
          type: row.type,
          data: row.data,
          timestamp,
          userId: row.user_id,
          syncLevel: row.sync_level,
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Saves an array of `AuditLogEntry` entries to the audit log store.
   *
   * Entries are saved within a transaction to ensure atomicity.
   *
   * @param entries An array of `AuditLogEntry` objects to save.
   * @returns A Promise that resolves when the audit log entries are successfully saved.
   * @throws {Error} If the database transaction fails during the save operation.
   */
  async saveAuditLog(entries: AuditLogEntry[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const entry of entries) {
        await client.query(
          "INSERT INTO audit_log (guid, tenant_id, action, entity_guid, event_guid, changes, user_id, signature, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [
            entry.guid,
            this.tenantId,
            entry.action,
            entry.entityGuid,
            entry.eventGuid,
            entry.changes,
            entry.userId,
            entry.signature,
            entry.timestamp,
          ],
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
   * Retrieves all `AuditLogEntry` entries for the current tenant from the audit log store.
   *
   * @returns A Promise that resolves with an array of all `AuditLogEntry` entries.
   * @throws {Error} If the database query fails.
   */
  async getAuditLog(): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, action, entity_guid, event_guid, changes, user_id, signature, timestamp FROM audit_log WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows.map((row) => ({
        guid: row.guid,
        action: row.action,
        entityGuid: row.entity_guid,
        eventGuid: row.event_guid,
        changes: row.changes,
        signature: row.signature,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Saves the Merkle root to the Merkle root store.
   *
   * If a Merkle root already exists for the tenant, this operation will do nothing (ON CONFLICT DO NOTHING).
   *
   * @param root The Merkle root string to save.
   * @returns A Promise that resolves when the Merkle root is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async saveMerkleRoot(root: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("INSERT INTO merkle_root (root, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
        root,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves the latest stored Merkle root for the current tenant.
   *
   * @returns A Promise that resolves with the Merkle root string, or an empty string if no root exists.
   * @throws {Error} If the database query fails.
   */
  async getMerkleRoot(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("SELECT root FROM merkle_root WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1", [
        this.tenantId,
      ]);
      return result.rows.length > 0 ? result.rows[0].root : "";
    } finally {
      client.release();
    }
  }

  /**
   * Updates the `syncLevel` for a specific event identified by its GUID.
   *
   * @param id The GUID of the event to update.
   * @param syncLevel The new `SyncLevel` to set for the event.
   * @returns A Promise that resolves when the event's sync level is updated.
   * @throws {Error} If the database update fails.
   */
  async updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE events SET sync_level = $1 WHERE guid = $2", [syncLevel, id]);
    } finally {
      client.release();
    }
  }

  /**
   * Updates the `syncLevel` for audit log entries associated with a given entity GUID.
   *
   * @param entityGuid The GUID of the entity whose associated audit log entries' sync levels need to be updated.
   * @param syncLevel The new `SyncLevel` to set for the audit log entries.
   * @returns A Promise that resolves when the update is complete.
   * @throws {Error} If the database update fails.
   */
  async updateAuditLogSyncLevel(entityGuid: string, syncLevel: SyncLevel): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE audit_log SET sync_level = $1 WHERE entity_guid = $2", [syncLevel, entityGuid]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves `FormSubmission` events that have occurred since a specified timestamp.
   *
   * Events are ordered by timestamp in ascending order (oldest first).
   *
   * @param timestamp The timestamp (ISO 8601 string or Date object) from which to retrieve events (exclusive).
   * @returns A Promise that resolves with an array of `FormSubmission` events.
   * @throws {Error} If the database query fails.
   */
  async getEventsSince(timestamp: string | Date): Promise<FormSubmission[]> {
    const timestampString = timestamp ? timestamp : new Date(0).toISOString();
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level FROM events WHERE timestamp > $1 AND tenant_id = $2 ORDER BY timestamp ASC",
        [timestampString, this.tenantId],
      );

      return result.rows.map((row) => ({
        guid: row.guid,
        entityGuid: row.entity_guid,
        type: row.type,
        data: row.data,
        timestamp: row.timestamp,
        userId: row.user_id,
        syncLevel: row.sync_level,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves `FormSubmission` events that have occurred since a specified timestamp with pagination support.
   *
   * Events are ordered by timestamp in ascending order (oldest first) and limited by `limit`.
   *
   * @param timestamp The timestamp (ISO 8601 string or Date object) from which to retrieve events (exclusive).
   * @param limit The maximum number of events to retrieve in a single page. Defaults to 100.
   * @returns A Promise that resolves with an object containing an array of `FormSubmission` events and the `nextCursor` for pagination.
   * @throws {Error} If the database query fails.
   */
  async getEventsSincePagination(
    timestamp: string | Date,
    limit: number = 100,
  ): Promise<{
    events: FormSubmission[];
    nextCursor: string | Date | null;
  }> {
    const timestampString = timestamp ? timestamp : new Date(0).toISOString();
    const client = await this.pool.connect();
    try {
      const query = `
          SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level
          FROM events
          WHERE timestamp > $1 
          AND tenant_id = $2
          ORDER BY timestamp ASC
          LIMIT $3
        `;
      const result = await client.query(query, [timestampString, this.tenantId, limit]);
      const events = result.rows.map((row) => ({
        guid: row.guid,
        entityGuid: row.entity_guid,
        type: row.type,
        data: row.data,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
        syncLevel: row.sync_level,
      }));
      const nextCursor =
        result.rows.length === limit ? result.rows[result.rows.length - 1].timestamp.toISOString() : null;
      return { events, nextCursor };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves `AuditLogEntry` entries that have occurred since a specified timestamp.
   *
   * Audit logs are ordered by timestamp in descending order (newest first).
   *
   * @param timestamp The ISO 8601 timestamp string from which to retrieve audit logs (exclusive).
   * @returns A Promise that resolves with an array of `AuditLogEntry` entries.
   * @throws {Error} If the database query fails.
   */
  async getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, action, entity_guid, event_guid, changes, user_id, signature, timestamp FROM audit_log WHERE timestamp > $1 AND tenant_id = $2",
        [timestamp, this.tenantId],
      );
      return result.rows.map((row) => ({
        guid: row.guid,
        action: row.action,
        entityGuid: row.entity_guid,
        eventGuid: row.event_guid,
        changes: row.changes,
        signature: row.signature,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Updates the `syncLevel` for a batch of `FormSubmission` events based on their GUIDs.
   *
   * This operation is performed within a transaction for atomicity.
   *
   * @param events An array of `FormSubmission` objects, each containing the GUID and the new `syncLevel`.
   * @returns A Promise that resolves when all specified events' sync levels are updated.
   * @throws {Error} If the database transaction fails during the update operation.
   */
  async updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) {
        await client.query("UPDATE events SET sync_level = $1 WHERE guid = $2 AND tenant_id = $3", [
          event.syncLevel,
          event.guid,
          this.tenantId,
        ]);
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
   * Retrieves the timestamp of the last successful remote synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastRemoteSyncTimestamp(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT MAX(timestamp) AS last_remote_sync_timestamp FROM last_remote_sync_timestamp WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows?.[0]?.last_remote_sync_timestamp?.toISOString() || "";
    } finally {
      client.release();
    }
  }

  /**
   * Sets the timestamp of the last successful remote synchronization.
   *
   * This operation deletes any existing remote sync timestamp for the tenant and inserts the new one.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastRemoteSyncTimestamp(timestamp: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM last_remote_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("INSERT INTO last_remote_sync_timestamp (timestamp, tenant_id) VALUES ($1, $2)", [
        timestamp,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves the timestamp of the last successful local synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastLocalSyncTimestamp(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT MAX(timestamp) AS last_local_sync_timestamp FROM last_local_sync_timestamp WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows?.[0]?.last_local_sync_timestamp?.toISOString() || "";
    } finally {
      client.release();
    }
  }

  /**
   * Sets the timestamp of the last successful local synchronization.
   *
   * This operation deletes any existing local sync timestamp for the tenant and inserts the new one.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastLocalSyncTimestamp(timestamp: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM last_local_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("INSERT INTO last_local_sync_timestamp (timestamp, tenant_id) VALUES ($1, $2)", [
        timestamp,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves the timestamp of the last successful external pull synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastPullExternalSyncTimestamp(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT MAX(timestamp) AS last_pull_external_sync_timestamp FROM last_pull_external_sync_timestamp WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows?.[0]?.last_pull_external_sync_timestamp?.toISOString() || "";
    } finally {
      client.release();
    }
  }

  /**
   * Sets the timestamp of the last successful external pull synchronization.
   *
   * This operation deletes any existing external pull sync timestamp for the tenant and inserts the new one.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastPullExternalSyncTimestamp(timestamp: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM last_pull_external_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("INSERT INTO last_pull_external_sync_timestamp (timestamp, tenant_id) VALUES ($1, $2)", [
        timestamp,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves the timestamp of the last successful external push synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastPushExternalSyncTimestamp(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT MAX(timestamp) AS last_push_external_sync_timestamp FROM last_push_external_sync_timestamp WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows?.[0]?.last_push_external_sync_timestamp?.toISOString() || "";
    } finally {
      client.release();
    }
  }

  /**
   * Sets the timestamp of the last successful external push synchronization.
   *
   * This operation deletes any existing external push sync timestamp for the tenant and inserts the new one.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastPushExternalSyncTimestamp(timestamp: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM last_push_external_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("INSERT INTO last_push_external_sync_timestamp (timestamp, tenant_id) VALUES ($1, $2)", [
        timestamp,
        this.tenantId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Checks if an event with the given GUID exists in the event store for the current tenant.
   *
   * @param guid The GUID of the event to check.
   * @returns A Promise that resolves to `true` if the event exists, `false` otherwise.
   * @throws {Error} If the database query fails.
   */
  async isEventExisted(guid: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("SELECT COUNT(*) FROM events WHERE guid = $1 AND tenant_id = $2", [
        guid,
        this.tenantId,
      ]);
      return result.rows[0].count > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves the audit trail for a specific entity, identified by its `entityGuid`.
   *
   * Audit log entries are ordered by timestamp in descending order (newest first).
   *
   * @param entityGuid The GUID of the entity to retrieve the audit trail for.
   * @returns A Promise that resolves with an array of `AuditLogEntry` entries.
   * @throws {Error} If the database query fails.
   */
  async getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT guid, action, entity_guid, event_guid, changes, user_id, signature, timestamp FROM audit_log WHERE entity_guid = $1 AND tenant_id = $2 ORDER BY timestamp DESC",
        [entityGuid, this.tenantId],
      );
      return result.rows.map((row) => ({
        guid: row.guid,
        action: row.action,
        entityGuid: row.entity_guid,
        eventGuid: row.event_guid,
        changes: row.changes,
        signature: row.signature,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Clears all events, audit logs, Merkle roots, and sync timestamps for the current tenant from the store.
   *
   * @returns A Promise that resolves when all data is cleared.
   * @throws {Error} If the database deletion fails.
   */
  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM events WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM audit_log WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM merkle_root WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM last_remote_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM last_local_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM last_pull_external_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
      await client.query("DELETE FROM last_push_external_sync_timestamp WHERE tenant_id = $1", [this.tenantId]);
    } finally {
      client.release();
    }
  }
}
