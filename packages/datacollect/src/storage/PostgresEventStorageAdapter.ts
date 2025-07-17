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

export class PostgresEventStorageAdapter implements EventStorageAdapter {
  private pool: Pool;
  private tenantId: string;

  constructor(connectionString: string, tenantId?: string) {
    this.pool = new Pool({
      connectionString,
    });
    this.tenantId = tenantId || "default";
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

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

  async updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE events SET sync_level = $1 WHERE guid = $2", [syncLevel, id]);
    } finally {
      client.release();
    }
  }

  async updateAuditLogSyncLevel(entityGuid: string, syncLevel: SyncLevel): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("UPDATE audit_log SET sync_level = $1 WHERE entity_guid = $2", [syncLevel, entityGuid]);
    } finally {
      client.release();
    }
  }

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

  async getEventsSelfServicePagination(
    entityGuid: string,
    timestamp: string | Date,
  ): Promise<{ events: FormSubmission[] }> {
    const client = await this.pool.connect();
    try {
      // Get all events to build the descendant map
      const allEventsResult = await client.query(
        "SELECT guid, entity_guid, type, data, timestamp, user_id, sync_level FROM events WHERE tenant_id = $1",
        [this.tenantId],
      );

      const allEvents = allEventsResult.rows.map((row) => ({
        guid: row.guid,
        entityGuid: row.entity_guid,
        type: row.type,
        data: row.data,
        timestamp: row.timestamp.toISOString(),
        userId: row.user_id,
        syncLevel: row.sync_level,
      }));

      // Build parent-child relationships map
      const parentToChildren = new Map<string, Set<string>>();
      allEvents.forEach((event) => {
        if (event.data && event.data.parentGuid) {
          if (!parentToChildren.has(event.data.parentGuid)) {
            parentToChildren.set(event.data.parentGuid, new Set());
          }
          parentToChildren.get(event.data.parentGuid)!.add(event.entityGuid);
        }
      });

      // Recursively find all descendants using breadth-first search
      const findDescendants = (guid: string): Set<string> => {
        const descendants = new Set<string>();
        const queue = [guid];

        // Add the entity itself to descendants
        descendants.add(guid);

        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = parentToChildren.get(current);

          if (children) {
            children.forEach((child) => {
              if (!descendants.has(child)) {
                descendants.add(child);
                queue.push(child);
              }
            });
          }
        }

        return descendants;
      };

      const descendants = findDescendants(entityGuid);

      // Filter events that are descendants (including the entity itself) and sort by timestamp and filter by timestamp
      const descendantEvents = allEvents
        .filter((event) => descendants.has(event.entityGuid))
        .filter((event) => event.timestamp >= timestamp)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Return only the events
      return { events: descendantEvents };
    } finally {
      client.release();
    }
  }

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

  async getLastSyncTimestamp(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT MAX(timestamp) AS last_sync_timestamp FROM last_sync_timestamp WHERE tenant_id = $1",
        [this.tenantId],
      );
      return result.rows.length > 0 ? result.rows[0].last_sync_timestamp.toISOString() : "";
    } finally {
      client.release();
    }
  }

  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "INSERT INTO last_sync_timestamp (timestamp, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [timestamp, this.tenantId],
      );
    } finally {
      client.release();
    }
  }

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
