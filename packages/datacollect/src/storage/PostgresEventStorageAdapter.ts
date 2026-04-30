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
import { and, eq, gt, sql, asc, desc, count } from "drizzle-orm";
import { AuditLogEntry, EventStorageAdapter, FormSubmission, SyncLevel } from "../interfaces/types";
import { createDrizzleFromPool, DrizzleDatabase, withClient } from "../db/connection";
import { events, auditLog, syncMetadata } from "../db/schema";
import { createLogger } from "../utils/logger";

const log = createLogger("PostgresEventStorageAdapter");

/**
 * PostgreSQL implementation of the EventStorageAdapter for server-side event persistence.
 *
 * This adapter provides scalable, tamper-evident event storage using PostgreSQL.
 * It is designed for production server deployments requiring robust data persistence
 * and efficient event sourcing operations.
 *
 * Key features:
 * - **ACID Transactions**: Full PostgreSQL transaction support for data consistency.
 * - **Multi-Tenant Support**: Complete tenant isolation using `tenant_id` partitioning.
 * - **Immutable Event Storage**: All events are stored as immutable records.
 * - **Audit Trail Management**: Comprehensive audit logging for compliance and debugging.
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
 * - `sync_metadata`: Key-value table for storing sync timestamps and other metadata, keyed by `(tenant_id, key)`.
 *
 * @example
 * Basic server setup:
 * ```typescript
 * import { PostgresEventStorageAdapter } from '@idpass/data-collect-core';
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
  private db: DrizzleDatabase;
  private tenantId: string;
  private ownsPool: boolean;

  constructor(connectionString: string, tenantId?: string);
  /**
   * Creates a PostgresEventStorageAdapter using an existing Pool.
   * When constructed this way, the adapter does NOT own the pool and will not close it.
   */
  constructor(pool: Pool, tenantId?: string);
  constructor(connectionStringOrPool: string | Pool, tenantId?: string) {
    if (typeof connectionStringOrPool === "string") {
      this.pool = new Pool({ connectionString: connectionStringOrPool });
      this.ownsPool = true;
    } else {
      this.pool = connectionStringOrPool;
      this.ownsPool = false;
    }
    this.db = createDrizzleFromPool(this.pool);
    this.tenantId = tenantId || "default";
  }

  /**
   * Returns the underlying pg Pool used by this adapter.
   * Useful for creating transactional EDM stacks that share a single connection pool.
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Replaces the internal Drizzle database instance.
   * Used to inject a Drizzle transaction object so that all operations on this
   * adapter participate in an external transaction.
   *
   * @param db A Drizzle database or transaction instance.
   */
  setDrizzleInstance(db: DrizzleDatabase): void {
    this.db = db;
  }

  /**
   * Closes all connections in the PostgreSQL connection pool.
   * Only closes the pool if this adapter owns it (created from a connection string).
   * When constructed with an external Pool, the caller is responsible for pool lifecycle.
   *
   * @returns A Promise that resolves when the connection is closed.
   */
  async closeConnection(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  /**
   * Initializes the PostgreSQL database with required tables and schemas for events and audit logs.
   *
   * Creates:
   * - `events` table with `guid` as primary key and various indexes for efficient querying.
   * - `audit_log` table for storing audit trail entries.
   * - `sync_metadata` table for tracking different synchronization timestamps.
   *
   * This method is idempotent and safe to call multiple times.
   *
   * @returns A Promise that resolves when the database is successfully initialized.
   * @throws {Error} When database connection fails or table creation fails.
   */
  async initialize() {
    await withClient(this.pool, async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          guid TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          entity_guid TEXT,
          type TEXT,
          data JSONB,
          timestamp TIMESTAMPTZ,
          user_id TEXT,
          sync_level INTEGER,
          seq SERIAL
        )
      `);
      // Add the seq column to existing tables that were created without it.
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE events ADD COLUMN IF NOT EXISTS seq SERIAL;
        EXCEPTION WHEN others THEN NULL;
        END $$
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
        CREATE TABLE IF NOT EXISTS sync_metadata (
          tenant_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          value TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (tenant_id, key)
        )
      `);

      // Add indexes for tenant_id
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id)");

      // Performance indexes for common query patterns
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_entity_guid ON events(entity_guid)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_tenant_timestamp ON events(tenant_id, timestamp)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_events_sync_level ON events(sync_level)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_entity_guid ON audit_log(entity_guid)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)");
    });
  }

  /**
   * Saves an array of `FormSubmission` events to the event store.
   *
   * Events are saved within a transaction to ensure atomicity. If any event fails to save,
   * the entire transaction is rolled back.
   *
   * @param eventList An array of `FormSubmission` objects to save.
   * @returns A Promise that resolves with an array of GUIDs of the successfully saved events.
   * @throws {Error} If the database transaction fails during the save operation.
   */
  async saveEvents(eventList: FormSubmission[]): Promise<string[]> {
    const guids: string[] = [];
    await this.db.transaction(async (tx) => {
      for (const event of eventList) {
        // onConflictDoNothing: if the event was already pushed (e.g., client
        // retried after the server accepted but before the client updated its
        // local sync cursor), silently skip the duplicate instead of throwing.
        // Use .returning() so only actually-inserted rows produce guids.
        const inserted = await tx.insert(events).values({
          guid: event.guid,
          tenantId: this.tenantId,
          entityGuid: event.entityGuid,
          type: event.type,
          data: event.data,
          timestamp: new Date(event.timestamp),
          userId: event.userId,
          syncLevel: event.syncLevel,
        }).onConflictDoNothing({ target: events.guid }).returning({ guid: events.guid });
        if (inserted.length > 0) {
          guids.push(inserted[0].guid);
        }
      }
    });
    return guids;
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
    const result = await this.db
      .select({
        guid: events.guid,
        entityGuid: events.entityGuid,
        type: events.type,
        data: events.data,
        timestamp: events.timestamp,
        userId: events.userId,
        syncLevel: events.syncLevel,
      })
      .from(events)
      .where(eq(events.tenantId, this.tenantId))
      .orderBy(asc(events.seq));

    return result.map((row) => {
      this.validateEventRow(row);
      // const timestamp: string = row.timestamp ? row.timestamp.toISOString() : null;
      const timestamp: string = row.timestamp ? new Date(row.timestamp).toISOString() : "";
      return {
        guid: row.guid,
        entityGuid: row.entityGuid || "",
        type: row.type || "",
        data: (row.data as Record<string, unknown>) || {},
        timestamp,
        userId: row.userId || "",
        syncLevel: row.syncLevel ?? SyncLevel.LOCAL,
      };
    });
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
    await this.db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx.insert(auditLog).values({
          guid: entry.guid,
          tenantId: this.tenantId,
          action: entry.action,
          entityGuid: entry.entityGuid,
          eventGuid: entry.eventGuid,
          changes: entry.changes,
          userId: entry.userId,
          signature: entry.signature,
          timestamp: new Date(entry.timestamp),
        });
      }
    });
  }

  /**
   * Retrieves all `AuditLogEntry` entries for the current tenant from the audit log store.
   *
   * @returns A Promise that resolves with an array of all `AuditLogEntry` entries.
   * @throws {Error} If the database query fails.
   */
  async getAuditLog(): Promise<AuditLogEntry[]> {
    const result = await this.db
      .select({
        guid: auditLog.guid,
        action: auditLog.action,
        entityGuid: auditLog.entityGuid,
        eventGuid: auditLog.eventGuid,
        changes: auditLog.changes,
        userId: auditLog.userId,
        signature: auditLog.signature,
        timestamp: auditLog.timestamp,
      })
      .from(auditLog)
      .where(eq(auditLog.tenantId, this.tenantId));

    return result.map((row) => ({
      guid: row.guid || "",
      action: row.action || "",
      entityGuid: row.entityGuid || "",
      eventGuid: row.eventGuid || "",
      changes: (row.changes as object) || {},
      signature: row.signature || "",
      timestamp: row.timestamp ? row.timestamp.toISOString() : "",
      userId: row.userId || "",
    }));
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
    await this.db.update(events).set({ syncLevel }).where(and(eq(events.guid, id), eq(events.tenantId, this.tenantId)));
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
    // Use this.db instead of this.pool so the query participates in any
    // active transaction rather than bypassing it with a separate connection.
    await this.db.execute(
      sql`UPDATE audit_log SET sync_level = ${syncLevel} WHERE entity_guid = ${entityGuid}`,
    );
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
    const timestampValue = timestamp ? new Date(timestamp) : new Date(0);

    const result = await this.db
      .select({
        guid: events.guid,
        entityGuid: events.entityGuid,
        type: events.type,
        data: events.data,
        timestamp: events.timestamp,
        userId: events.userId,
        syncLevel: events.syncLevel,
      })
      .from(events)
      .where(and(gt(events.timestamp, timestampValue), eq(events.tenantId, this.tenantId)))
      .orderBy(asc(events.timestamp), asc(events.guid));

    return result.map((row) => {
      this.validateEventRow(row);
      return {
        guid: row.guid,
        entityGuid: row.entityGuid || "",
        type: row.type || "",
        data: (row.data as Record<string, unknown>) || {},
        timestamp: row.timestamp ? new Date(row.timestamp as unknown as Date).toISOString() : "",
        userId: row.userId || "",
        syncLevel: row.syncLevel ?? SyncLevel.LOCAL,
      };
    });
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
    const cursorString = timestamp ? String(timestamp) : new Date(0).toISOString();
    return withClient(this.pool, async (client) => {
      let query: string;
      let params: unknown[];

      if (cursorString.includes("|")) {
        // Composite cursor: "timestamp|guid" for deterministic pagination
        const [cursorTimestamp, cursorGuid] = cursorString.split("|", 2);
        query = `
          SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level
          FROM events
          WHERE (timestamp > $1 OR (timestamp = $1 AND guid > $2))
          AND tenant_id = $3
          ORDER BY timestamp ASC, guid ASC
          LIMIT $4
        `;
        params = [cursorTimestamp, cursorGuid, this.tenantId, limit];
      } else {
        // Plain timestamp for backwards compatibility
        query = `
          SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level
          FROM events
          WHERE timestamp > $1
          AND tenant_id = $2
          ORDER BY timestamp ASC, guid ASC
          LIMIT $3
        `;
        params = [cursorString, this.tenantId, limit];
      }

      const result = await client.query(query, params);
      const eventList = result.rows.map((row) => ({
        guid: row.guid,
        entityGuid: row.entity_guid,
        type: row.type,
        data: row.data,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
        syncLevel: row.sync_level,
      }));

      let nextCursor: string | null = null;
      if (result.rows.length === limit) {
        const lastRow = result.rows[result.rows.length - 1];
        nextCursor = `${lastRow.timestamp.toISOString()}|${lastRow.guid}`;
      }

      return { events: eventList, nextCursor };
    });
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
    const result = await this.db
      .select({
        guid: auditLog.guid,
        action: auditLog.action,
        entityGuid: auditLog.entityGuid,
        eventGuid: auditLog.eventGuid,
        changes: auditLog.changes,
        userId: auditLog.userId,
        signature: auditLog.signature,
        timestamp: auditLog.timestamp,
      })
      .from(auditLog)
      .where(and(gt(auditLog.timestamp, new Date(timestamp)), eq(auditLog.tenantId, this.tenantId)));

    return result.map((row) => ({
      guid: row.guid || "",
      action: row.action || "",
      entityGuid: row.entityGuid || "",
      eventGuid: row.eventGuid || "",
      changes: (row.changes as object) || {},
      signature: row.signature || "",
      timestamp: row.timestamp ? row.timestamp.toISOString() : "",
      userId: row.userId || "",
    }));
  }

  /**
   * Updates the `syncLevel` for a batch of `FormSubmission` events based on their GUIDs.
   *
   * This operation is performed within a transaction for atomicity.
   *
   * @param eventList An array of `FormSubmission` objects, each containing the GUID and the new `syncLevel`.
   * @returns A Promise that resolves when all specified events' sync levels are updated.
   * @throws {Error} If the database transaction fails during the update operation.
   */
  async updateSyncLevelFromEvents(eventList: FormSubmission[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const event of eventList) {
        await tx
          .update(events)
          .set({ syncLevel: event.syncLevel })
          .where(and(eq(events.guid, event.guid), eq(events.tenantId, this.tenantId)));
      }
    });
  }

  /**
   * Retrieves the timestamp of the last successful remote synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastRemoteSyncTimestamp(): Promise<string> {
    return this.getSyncMetadataValue("last_remote_sync_timestamp");
  }

  /**
   * Sets the timestamp of the last successful remote synchronization.
   *
   * Uses an UPSERT to insert or update the timestamp in the sync_metadata table.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastRemoteSyncTimestamp(timestamp: string): Promise<void> {
    await this.setSyncMetadataValue("last_remote_sync_timestamp", timestamp);
  }

  /**
   * Retrieves the timestamp of the last successful local synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastLocalSyncTimestamp(): Promise<string> {
    return this.getSyncMetadataValue("last_local_sync_timestamp");
  }

  /**
   * Sets the timestamp of the last successful local synchronization.
   *
   * Uses an UPSERT to insert or update the timestamp in the sync_metadata table.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastLocalSyncTimestamp(timestamp: string): Promise<void> {
    await this.setSyncMetadataValue("last_local_sync_timestamp", timestamp);
  }

  /**
   * Retrieves the timestamp of the last successful external pull synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastPullExternalSyncTimestamp(): Promise<string> {
    return this.getSyncMetadataValue("last_pull_external_sync_timestamp");
  }

  /**
   * Sets the timestamp of the last successful external pull synchronization.
   *
   * Uses an UPSERT to insert or update the timestamp in the sync_metadata table.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastPullExternalSyncTimestamp(timestamp: string): Promise<void> {
    await this.setSyncMetadataValue("last_pull_external_sync_timestamp", timestamp);
  }

  /**
   * Retrieves the timestamp of the last successful external push synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If the database query fails.
   */
  async getLastPushExternalSyncTimestamp(): Promise<string> {
    return this.getSyncMetadataValue("last_push_external_sync_timestamp");
  }

  /**
   * Sets the timestamp of the last successful external push synchronization.
   *
   * Uses an UPSERT to insert or update the timestamp in the sync_metadata table.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If the database operation fails.
   */
  async setLastPushExternalSyncTimestamp(timestamp: string): Promise<void> {
    await this.setSyncMetadataValue("last_push_external_sync_timestamp", timestamp);
  }

  /**
   * Scope hash tracking is a client-only concern; the server is stateless on client scope state.
   *
   * @throws {Error} Always throws; this method is not supported on the server-side adapter.
   */
  async getLastScopeHash(): Promise<string | null> {
    throw new Error(
      "PostgresEventStorageAdapter.getLastScopeHash is client-only; the server is stateless on client scope state",
    );
  }

  /**
   * Scope hash tracking is a client-only concern; the server is stateless on client scope state.
   *
   * @throws {Error} Always throws; this method is not supported on the server-side adapter.
   */
  async setLastScopeHash(_hash: string): Promise<void> {
    throw new Error(
      "PostgresEventStorageAdapter.setLastScopeHash is client-only; the server is stateless on client scope state",
    );
  }

  /**
   * Checks if an event with the given GUID exists in the event store for the current tenant.
   *
   * @param guid The GUID of the event to check.
   * @returns A Promise that resolves to `true` if the event exists, `false` otherwise.
   * @throws {Error} If the database query fails.
   */
  async isEventExisted(guid: string): Promise<boolean> {
    const result = await this.db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.guid, guid), eq(events.tenantId, this.tenantId)));

    return result[0].value > 0;
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
    const result = await this.db
      .select({
        guid: auditLog.guid,
        action: auditLog.action,
        entityGuid: auditLog.entityGuid,
        eventGuid: auditLog.eventGuid,
        changes: auditLog.changes,
        userId: auditLog.userId,
        signature: auditLog.signature,
        timestamp: auditLog.timestamp,
      })
      .from(auditLog)
      .where(and(eq(auditLog.entityGuid, entityGuid), eq(auditLog.tenantId, this.tenantId)))
      .orderBy(desc(auditLog.timestamp));

    return result.map((row) => ({
      guid: row.guid || "",
      action: row.action || "",
      entityGuid: row.entityGuid || "",
      eventGuid: row.eventGuid || "",
      changes: (row.changes as object) || {},
      signature: row.signature || "",
      timestamp: row.timestamp ? row.timestamp.toISOString() : "",
      userId: row.userId || "",
    }));
  }

  /**
   * Clears all events, audit logs, and sync metadata for the current tenant from the store.
   *
   * @returns A Promise that resolves when all data is cleared.
   * @throws {Error} If the database deletion fails.
   */
  async clearStore(): Promise<void> {
    await this.db.delete(events).where(eq(events.tenantId, this.tenantId));
    await this.db.delete(auditLog).where(eq(auditLog.tenantId, this.tenantId));
    await this.db.delete(syncMetadata).where(eq(syncMetadata.tenantId, this.tenantId));
  }

  /**
   * Persists the latest hash anchor for tamper detection on restart.
   *
   * @param hash The hash string to persist.
   * @returns A Promise that resolves when the hash is persisted.
   */
  async persistHashAnchor(hash: string): Promise<void> {
    await this.setSyncMetadataValue("hash_anchor", hash);
  }

  /**
   * Retrieves the previously persisted hash anchor, or null if none exists.
   *
   * @returns The persisted hash string, or null if no anchor has been saved.
   */
  async getPersistedHashAnchor(): Promise<string | null> {
    const value = await this.getSyncMetadataValue("hash_anchor");
    return value || null;
  }

  /**
   * Helper to get a sync metadata value by key.
   */
  private async getSyncMetadataValue(key: string): Promise<string> {
    const result = await this.db
      .select({ value: syncMetadata.value })
      .from(syncMetadata)
      .where(and(eq(syncMetadata.tenantId, this.tenantId), eq(syncMetadata.key, key)));

    return result[0]?.value || "";
  }

  /**
   * Helper to set a sync metadata value by key (upsert).
   */
  private async setSyncMetadataValue(key: string, value: string): Promise<void> {
    await this.db
      .insert(syncMetadata)
      .values({
        tenantId: this.tenantId,
        key,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [syncMetadata.tenantId, syncMetadata.key],
        set: {
          value,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Validates critical fields on an event database row and logs warnings for type mismatches.
   * Ensures guid and type are strings and timestamp is present.
   */
  private validateEventRow(row: { guid: string; type: string | null; timestamp: Date | null }): void {
    if (typeof row.guid !== "string" || row.guid.length === 0) {
      log.warn({ guid: row.guid }, "Event row has missing or non-string guid");
    }
    if (typeof row.type !== "string" || row.type.length === 0) {
      log.warn({ guid: row.guid, type: row.type }, "Event row has missing or non-string type");
    }
    if (row.timestamp === null || row.timestamp === undefined) {
      log.warn({ guid: row.guid }, "Event row has null or missing timestamp");
    }
  }
}
