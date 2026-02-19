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

import { v4 as uuidv4 } from "uuid";
import { and, eq, desc, asc, gt, sql, count } from "drizzle-orm";
import { Pool } from "pg";
import { createDrizzleFromPool, DrizzleDatabase } from "../db/connection";
import { entitySnapshots, events, entities } from "../db/schema";
import { EntityDoc, EntityPair, FormSubmission, SyncLevel } from "../interfaces/types";
import { EventApplierService } from "./EventApplierService";
import { createLogger } from "../utils/logger";

const log = createLogger("SnapshotService");

/**
 * Represents an entity snapshot record as stored in the database.
 */
export interface SnapshotRecord {
  id: string;
  entityGuid: string;
  tenantId: string;
  data: EntityDoc;
  eventSequence: number;
  createdAt?: Date | null;
}

/**
 * Result of a batch snapshot creation operation.
 */
export interface BatchSnapshotResult {
  /** Number of snapshots created */
  created: number;
  /** Number of entities checked */
  checked: number;
  /** Number of entities that did not need snapshots */
  skipped: number;
  /** Errors encountered during snapshot creation */
  errors: Array<{ entityGuid: string; error: string }>;
}

/**
 * Default number of events after which a snapshot should be created.
 */
const DEFAULT_SNAPSHOT_THRESHOLD = 50;

/**
 * Service for managing entity snapshots in the event sourcing system.
 *
 * Snapshots are point-in-time captures of entity state that optimize
 * event replay performance. Instead of replaying all events from the
 * beginning, the system can load the latest snapshot and only replay
 * events that occurred after it.
 *
 * Key features:
 * - Automatic snapshot creation when event count exceeds threshold
 * - Batch snapshot creation for entire tenants
 * - Snapshot pruning to limit storage usage
 * - Entity rebuild from snapshot + incremental event replay
 */
export class SnapshotService {
  private pool: Pool;
  private db: DrizzleDatabase;
  private tenantId: string;

  constructor(
    connectionString: string,
    private eventApplierService: EventApplierService,
    tenantId: string = "default",
  ) {
    this.pool = new Pool({ connectionString });
    this.db = createDrizzleFromPool(this.pool);
    this.tenantId = tenantId;
  }

  /**
   * Initializes the entity_snapshots table in the database.
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_snapshots (
          id TEXT PRIMARY KEY,
          entity_guid TEXT NOT NULL,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          data JSONB NOT NULL,
          event_sequence INTEGER NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_entity_snapshots_entity_guid ON entity_snapshots(entity_guid)",
      );
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_entity_snapshots_tenant_id ON entity_snapshots(tenant_id)",
      );
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_entity_snapshots_entity_tenant ON entity_snapshots(entity_guid, tenant_id)",
      );
    } finally {
      client.release();
    }
  }

  /**
   * Creates a snapshot of the current state of an entity.
   *
   * The snapshot captures the entity's modified state and the sequence number
   * of the most recent event for that entity.
   *
   * @param entityGuid - The GUID of the entity to snapshot.
   * @returns The created snapshot record, or null if the entity was not found.
   */
  async createSnapshot(entityGuid: string): Promise<SnapshotRecord | null> {
    // Get the current entity state
    const entityResult = await this.db
      .select({ modified: entities.modified })
      .from(entities)
      .where(
        and(
          eq(entities.guid, entityGuid),
          eq(entities.tenantId, this.tenantId),
        ),
      );

    if (entityResult.length === 0) {
      log.warn({ entityGuid }, "Entity not found for snapshot creation");
      return null;
    }

    const entityData = entityResult[0].modified as EntityDoc;

    // Count events for this entity to determine the sequence number
    const eventCountResult = await this.db
      .select({ value: count() })
      .from(events)
      .where(
        and(
          eq(events.entityGuid, entityGuid),
          eq(events.tenantId, this.tenantId),
        ),
      );

    const eventSequence = Number(eventCountResult[0]?.value ?? 0);

    const id = uuidv4();
    const now = new Date();

    await this.db.insert(entitySnapshots).values({
      id,
      entityGuid,
      tenantId: this.tenantId,
      data: entityData,
      eventSequence,
      createdAt: now,
    });

    return {
      id,
      entityGuid,
      tenantId: this.tenantId,
      data: entityData,
      eventSequence,
      createdAt: now,
    };
  }

  /**
   * Retrieves the most recent snapshot for an entity.
   *
   * @param entityGuid - The GUID of the entity.
   * @returns The latest snapshot record, or null if none exists.
   */
  async getLatestSnapshot(entityGuid: string): Promise<SnapshotRecord | null> {
    const result = await this.db
      .select()
      .from(entitySnapshots)
      .where(
        and(
          eq(entitySnapshots.entityGuid, entityGuid),
          eq(entitySnapshots.tenantId, this.tenantId),
        ),
      )
      .orderBy(desc(entitySnapshots.eventSequence))
      .limit(1);

    if (result.length === 0) return null;

    return {
      id: result[0].id,
      entityGuid: result[0].entityGuid,
      tenantId: result[0].tenantId,
      data: result[0].data as EntityDoc,
      eventSequence: result[0].eventSequence,
      createdAt: result[0].createdAt,
    };
  }

  /**
   * Checks whether an entity has accumulated enough events since the last
   * snapshot to warrant a new one.
   *
   * @param entityGuid - The GUID of the entity.
   * @param threshold - Number of events after which a snapshot is recommended (default 50).
   * @returns True if the entity should have a new snapshot created.
   */
  async shouldSnapshot(entityGuid: string, threshold: number = DEFAULT_SNAPSHOT_THRESHOLD): Promise<boolean> {
    const latestSnapshot = await this.getLatestSnapshot(entityGuid);
    const lastSequence = latestSnapshot?.eventSequence ?? 0;

    // Count total events for this entity
    const eventCountResult = await this.db
      .select({ value: count() })
      .from(events)
      .where(
        and(
          eq(events.entityGuid, entityGuid),
          eq(events.tenantId, this.tenantId),
        ),
      );

    const totalEvents = Number(eventCountResult[0]?.value ?? 0);
    const eventsSinceSnapshot = totalEvents - lastSequence;

    return eventsSinceSnapshot >= threshold;
  }

  /**
   * Creates snapshots for all entities in a tenant that have accumulated
   * enough events since their last snapshot.
   *
   * @param tenantId - The tenant ID to process (uses instance tenantId if not provided).
   * @param threshold - Event count threshold for snapshot creation (default 50).
   * @returns Summary of the batch operation.
   */
  async createSnapshotsForTenant(
    tenantId?: string,
    threshold: number = DEFAULT_SNAPSHOT_THRESHOLD,
  ): Promise<BatchSnapshotResult> {
    const effectiveTenantId = tenantId || this.tenantId;
    const result: BatchSnapshotResult = { created: 0, checked: 0, skipped: 0, errors: [] };

    // Get all unique entity GUIDs that have events in this tenant
    const client = await this.pool.connect();
    try {
      const entityGuidsResult = await client.query(
        `SELECT DISTINCT entity_guid FROM events WHERE tenant_id = $1 AND entity_guid IS NOT NULL`,
        [effectiveTenantId],
      );

      for (const row of entityGuidsResult.rows) {
        result.checked++;
        const entityGuid = row.entity_guid;

        try {
          const needs = await this.shouldSnapshot(entityGuid, threshold);
          if (needs) {
            const snapshot = await this.createSnapshot(entityGuid);
            if (snapshot) {
              result.created++;
            } else {
              result.skipped++;
            }
          } else {
            result.skipped++;
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          result.errors.push({ entityGuid, error: errorMessage });
        }
      }
    } finally {
      client.release();
    }

    return result;
  }

  /**
   * Prunes old snapshots for an entity, keeping only the N most recent ones.
   *
   * @param entityGuid - The GUID of the entity.
   * @param keepCount - Number of most recent snapshots to keep (default 3).
   * @returns Number of snapshots deleted.
   */
  async pruneSnapshots(entityGuid: string, keepCount: number = 3): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Get IDs of snapshots to keep
      const keepResult = await client.query(
        `SELECT id FROM entity_snapshots
         WHERE entity_guid = $1 AND tenant_id = $2
         ORDER BY event_sequence DESC
         LIMIT $3`,
        [entityGuid, this.tenantId, keepCount],
      );

      const keepIds = keepResult.rows.map((r) => r.id);

      if (keepIds.length === 0) return 0;

      // Delete all snapshots except the ones to keep
      const placeholders = keepIds.map((_, i) => `$${i + 3}`).join(", ");
      const deleteResult = await client.query(
        `DELETE FROM entity_snapshots
         WHERE entity_guid = $1 AND tenant_id = $2
         AND id NOT IN (${placeholders})`,
        [entityGuid, this.tenantId, ...keepIds],
      );

      return deleteResult.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  /**
   * Rebuilds an entity's state from the latest snapshot plus incremental event replay.
   *
   * This method:
   * 1. Loads the latest snapshot for the entity.
   * 2. Finds all events that occurred after the snapshot's event sequence.
   * 3. Replays those events on top of the snapshot state.
   * 4. Returns the rebuilt entity state.
   *
   * If no snapshot exists, replays all events from the beginning.
   *
   * @param entityGuid - The GUID of the entity to rebuild.
   * @returns The rebuilt entity state, or null if no events exist.
   */
  async rebuildFromSnapshot(entityGuid: string): Promise<EntityDoc | null> {
    const snapshot = await this.getLatestSnapshot(entityGuid);

    // Get all events for this entity, ordered chronologically
    const allEventsResult = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.entityGuid, entityGuid),
          eq(events.tenantId, this.tenantId),
        ),
      )
      .orderBy(asc(events.timestamp));

    if (allEventsResult.length === 0) {
      return snapshot?.data ?? null;
    }

    // Determine which events to replay
    let eventsToReplay: typeof allEventsResult;
    let baseEntity: EntityDoc | null = null;

    if (snapshot) {
      // Skip the events that are already included in the snapshot
      eventsToReplay = allEventsResult.slice(snapshot.eventSequence);
      baseEntity = snapshot.data;
    } else {
      eventsToReplay = allEventsResult;
    }

    if (eventsToReplay.length === 0) {
      return baseEntity;
    }

    // If we have a base entity from the snapshot, save it first so the
    // event applier can find it when processing events
    const entityStore = this.eventApplierService.getEntityStore();

    if (baseEntity) {
      await entityStore.saveEntity(null, baseEntity);
    }

    // Replay events through the event applier
    let currentEntity: EntityDoc | null = baseEntity;
    for (const event of eventsToReplay) {
      const formSubmission: FormSubmission = {
        guid: event.guid,
        entityGuid: event.entityGuid || "",
        type: event.type || "",
        data: (event.data as Record<string, unknown>) || {},
        timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : "",
        userId: event.userId || "",
        syncLevel: event.syncLevel ?? SyncLevel.LOCAL,
      };

      try {
        const result = await this.eventApplierService.submitForm(formSubmission);
        if (result) {
          currentEntity = result;
        }
      } catch (err) {
        log.error({ err, eventGuid: event.guid, entityGuid }, "Error replaying event during snapshot rebuild");
      }
    }

    return currentEntity;
  }

  /**
   * Gets the total number of snapshots for an entity.
   *
   * @param entityGuid - The GUID of the entity.
   * @returns The number of snapshots.
   */
  async getSnapshotCount(entityGuid: string): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(entitySnapshots)
      .where(
        and(
          eq(entitySnapshots.entityGuid, entityGuid),
          eq(entitySnapshots.tenantId, this.tenantId),
        ),
      );

    return Number(result[0]?.value ?? 0);
  }

  /**
   * Clears all snapshots for the current tenant.
   */
  async clearStore(): Promise<void> {
    await this.db
      .delete(entitySnapshots)
      .where(eq(entitySnapshots.tenantId, this.tenantId));
  }

  /**
   * Closes the database connection pool.
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
