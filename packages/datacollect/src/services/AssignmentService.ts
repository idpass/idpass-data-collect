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
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDrizzleFromPool, DrizzleDatabase, withClient } from "../db/connection";
import { userAssignments, entityOverrides } from "../db/schema";
import { AreaService } from "./AreaService";

/**
 * Represents a user assignment record as stored in the database.
 */
export interface UserAssignmentRecord {
  id: string;
  userId: string;
  tenantId: string;
  areaId: string | null;
  role: string;
  includeDescendants: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Represents an entity override record as stored in the database.
 */
export interface EntityOverrideRecord {
  id: string;
  entityGuid: string;
  userId: string;
  tenantId: string;
  action: string;
  createdAt?: Date | null;
}

/**
 * Service for managing user-to-area assignments and entity overrides.
 *
 * Implements a hybrid assignment model:
 * - Area-based: users are assigned to areas, gaining access to all entities in those areas
 * - Per-entity overrides: specific entities can be explicitly included or excluded
 *
 * Used by selective sync to determine which data a client should receive.
 */
export class AssignmentService {
  private pool: Pool;
  private db: DrizzleDatabase;
  private areaService: AreaService;

  constructor(connectionString: string, areaService: AreaService) {
    this.pool = new Pool({ connectionString });
    this.db = createDrizzleFromPool(this.pool);
    this.areaService = areaService;
  }

  /**
   * Initializes the assignment tables in the database.
   */
  async initialize(): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_assignments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          area_id TEXT REFERENCES areas(id),
          role TEXT NOT NULL,
          include_descendants BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_user_assignments_user_id ON user_assignments(user_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_user_assignments_tenant_id ON user_assignments(tenant_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_user_assignments_area_id ON user_assignments(area_id)");
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_user_assignments_user_tenant ON user_assignments(user_id, tenant_id)",
      );

      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_overrides (
          id TEXT PRIMARY KEY,
          entity_guid TEXT NOT NULL,
          user_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          action TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_entity_overrides_user_id ON entity_overrides(user_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_entity_overrides_tenant_id ON entity_overrides(tenant_id)");
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_entity_overrides_entity_guid ON entity_overrides(entity_guid)",
      );
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_entity_overrides_user_tenant ON entity_overrides(user_id, tenant_id)",
      );
    });
  }

  /**
   * Assigns a user to an area with a specific role.
   *
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @param areaId - The area ID to assign the user to.
   * @param role - The role to assign (from SystemRole enum).
   * @param includeDescendants - Whether to include descendant areas (default true).
   * @returns The created assignment record.
   */
  async assignUserToArea(
    userId: string,
    tenantId: string,
    areaId: string,
    role: string,
    includeDescendants: boolean = true,
  ): Promise<UserAssignmentRecord> {
    const id = uuidv4();
    const now = new Date();

    await this.db.insert(userAssignments).values({
      id,
      userId,
      tenantId,
      areaId,
      role,
      includeDescendants,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      userId,
      tenantId,
      areaId,
      role,
      includeDescendants,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Removes an assignment by its ID.
   *
   * @param assignmentId - The assignment ID to remove.
   */
  async removeAssignment(assignmentId: string): Promise<void> {
    await this.db
      .delete(userAssignments)
      .where(eq(userAssignments.id, assignmentId));
  }

  /**
   * Retrieves all assignments for a user within a tenant.
   *
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @returns Array of user assignment records.
   */
  async getUserAssignments(userId: string, tenantId: string): Promise<UserAssignmentRecord[]> {
    const result = await this.db
      .select()
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.tenantId, tenantId),
        ),
      );

    return result.map((row) => ({
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      areaId: row.areaId,
      role: row.role,
      includeDescendants: row.includeDescendants ?? true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Retrieves all area IDs a user has access to, including descendant areas
   * where includeDescendants is true.
   *
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @returns Array of area IDs the user can access.
   */
  async getAssignedAreaIds(userId: string, tenantId: string): Promise<string[]> {
    const assignments = await this.getUserAssignments(userId, tenantId);
    const areaIdSet = new Set<string>();

    for (const assignment of assignments) {
      if (!assignment.areaId) continue;

      areaIdSet.add(assignment.areaId);

      if (assignment.includeDescendants) {
        const descendants = await this.areaService.getDescendants(assignment.areaId);
        for (const descendant of descendants) {
          areaIdSet.add(descendant.id);
        }
      }
    }

    return Array.from(areaIdSet);
  }

  /**
   * Adds a per-entity override (include or exclude) for a user.
   *
   * @param entityGuid - The entity GUID.
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @param action - "include" or "exclude".
   * @returns The created override record.
   */
  async addEntityOverride(
    entityGuid: string,
    userId: string,
    tenantId: string,
    action: "include" | "exclude",
  ): Promise<EntityOverrideRecord> {
    const id = uuidv4();
    const now = new Date();

    await this.db.insert(entityOverrides).values({
      id,
      entityGuid,
      userId,
      tenantId,
      action,
      createdAt: now,
    });

    return {
      id,
      entityGuid,
      userId,
      tenantId,
      action,
      createdAt: now,
    };
  }

  /**
   * Removes an entity override by its ID.
   *
   * @param overrideId - The override ID to remove.
   */
  async removeEntityOverride(overrideId: string): Promise<void> {
    await this.db
      .delete(entityOverrides)
      .where(eq(entityOverrides.id, overrideId));
  }

  /**
   * Retrieves all entity overrides for a user within a tenant.
   *
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @returns Array of entity override records.
   */
  async getEntityOverrides(userId: string, tenantId: string): Promise<EntityOverrideRecord[]> {
    const result = await this.db
      .select()
      .from(entityOverrides)
      .where(
        and(
          eq(entityOverrides.userId, userId),
          eq(entityOverrides.tenantId, tenantId),
        ),
      );

    return result.map((row) => ({
      id: row.id,
      entityGuid: row.entityGuid,
      userId: row.userId,
      tenantId: row.tenantId,
      action: row.action,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Computes the full set of entity GUIDs a user should have access to.
   *
   * Logic:
   * 1. Get all area IDs the user is assigned to (including descendants).
   * 2. Query all entities whose data.area_id matches any of those area IDs.
   * 3. Apply overrides: add "include" entities, remove "exclude" entities.
   *
   * @param userId - The user ID.
   * @param tenantId - The tenant ID.
   * @returns Array of entity GUIDs the user should see.
   */
  async getAssignedEntityGuids(userId: string, tenantId: string): Promise<string[]> {
    const areaIds = await this.getAssignedAreaIds(userId, tenantId);
    const overrides = await this.getEntityOverrides(userId, tenantId);

    const entityGuidSet = new Set<string>();

    // Get entities from assigned areas
    if (areaIds.length > 0) {
      await withClient(this.pool, async (client) => {
        const placeholders = areaIds.map((_, i) => `$${i + 2}`).join(", ");
        const result = await client.query(
          `SELECT guid FROM entities
           WHERE tenant_id = $1
           AND modified->>'data' IS NOT NULL
           AND modified->'data'->>'area_id' IN (${placeholders})`,
          [tenantId, ...areaIds],
        );

        for (const row of result.rows) {
          entityGuidSet.add(row.guid);
        }
      });
    }

    // Apply overrides
    for (const override of overrides) {
      if (override.action === "include") {
        entityGuidSet.add(override.entityGuid);
      } else if (override.action === "exclude") {
        entityGuidSet.delete(override.entityGuid);
      }
    }

    return Array.from(entityGuidSet);
  }

  /**
   * Clears all assignment and override data.
   */
  async clearStore(): Promise<void> {
    await this.db.delete(entityOverrides);
    await this.db.delete(userAssignments);
  }

  /**
   * Closes the database connection pool.
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
