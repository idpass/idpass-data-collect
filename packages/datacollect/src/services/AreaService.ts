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
import { eq, isNull, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDrizzleFromPool, DrizzleDatabase } from "../db/connection";
import { areas, entities } from "../db/schema";
import { createLogger } from "../utils/logger";

const log = createLogger("AreaService");

/**
 * Represents an area record as stored in the database.
 */
export interface AreaRecord {
  id: string;
  name: string;
  pcode: string | null;
  type: string;
  level: number;
  parentId: string | null;
  geometry?: unknown;
  metadata?: unknown;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Input format for creating an area.
 */
export interface CreateAreaInput {
  id?: string;
  name: string;
  pcode?: string;
  type: string;
  level: number;
  parentId?: string;
  geometry?: unknown;
  metadata?: unknown;
}

/**
 * Input format for HDX admin boundary import.
 */
export interface HdxAreaImportRecord {
  name: string;
  pcode: string;
  type: string;
  level: number;
  parentPcode?: string;
}

/**
 * Service for managing hierarchical geographic areas (HDX admin boundary aligned).
 *
 * Provides CRUD operations for areas, hierarchical traversal (ancestors/descendants),
 * bulk import from HDX admin boundary format, and entity-to-area assignment.
 */
export class AreaService {
  private pool: Pool;
  private db: DrizzleDatabase;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = createDrizzleFromPool(this.pool);
  }

  /**
   * Initializes the areas table in the database.
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS areas (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          pcode TEXT UNIQUE,
          type TEXT NOT NULL,
          level INTEGER NOT NULL,
          parent_id TEXT REFERENCES areas(id),
          geometry JSONB,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_areas_parent_id ON areas(parent_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_areas_level ON areas(level)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_areas_type ON areas(type)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_areas_pcode ON areas(pcode)");
    } finally {
      client.release();
    }
  }

  /**
   * Creates a single area record.
   *
   * @param input - The area data to create.
   * @returns The created area record.
   */
  async createArea(input: CreateAreaInput): Promise<AreaRecord> {
    const id = input.id || uuidv4();
    const now = new Date();

    await this.db.insert(areas).values({
      id,
      name: input.name,
      pcode: input.pcode || null,
      type: input.type,
      level: input.level,
      parentId: input.parentId || null,
      geometry: input.geometry || null,
      metadata: input.metadata || null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: input.name,
      pcode: input.pcode || null,
      type: input.type,
      level: input.level,
      parentId: input.parentId || null,
      geometry: input.geometry || null,
      metadata: input.metadata || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves an area by its ID.
   *
   * @param id - The area ID to look up.
   * @returns The area record, or null if not found.
   */
  async getArea(id: string): Promise<AreaRecord | null> {
    const result = await this.db
      .select()
      .from(areas)
      .where(eq(areas.id, id));

    if (result.length === 0) return null;
    return this.mapRow(result[0]);
  }

  /**
   * Retrieves an area by its p-code.
   *
   * @param pcode - The p-code to look up.
   * @returns The area record, or null if not found.
   */
  async getAreaByPcode(pcode: string): Promise<AreaRecord | null> {
    const result = await this.db
      .select()
      .from(areas)
      .where(eq(areas.pcode, pcode));

    if (result.length === 0) return null;
    return this.mapRow(result[0]);
  }

  /**
   * Retrieves the direct children of an area.
   *
   * @param parentId - The parent area ID.
   * @returns Array of child area records.
   */
  async getChildren(parentId: string): Promise<AreaRecord[]> {
    const result = await this.db
      .select()
      .from(areas)
      .where(eq(areas.parentId, parentId));

    return result.map((row) => this.mapRow(row));
  }

  /**
   * Retrieves the ancestor chain from a given area up to the root.
   * Returns ancestors in order from the immediate parent to the root.
   *
   * @param areaId - The starting area ID.
   * @returns Array of ancestor area records (parent first, root last).
   */
  async getAncestors(areaId: string): Promise<AreaRecord[]> {
    const ancestors: AreaRecord[] = [];
    let currentId: string | null = areaId;

    while (currentId) {
      const area = await this.getArea(currentId);
      if (!area) break;

      // Only add if it's not the starting area
      if (currentId !== areaId) {
        ancestors.push(area);
      }
      currentId = area.parentId;
    }

    return ancestors;
  }

  /**
   * Retrieves all descendants of an area (recursive, all levels below).
   * Uses a recursive CTE for efficient traversal.
   *
   * @param areaId - The parent area ID.
   * @returns Array of all descendant area records.
   */
  async getDescendants(areaId: string): Promise<AreaRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        WITH RECURSIVE descendants AS (
          SELECT id, name, pcode, type, level, parent_id, geometry, metadata, created_at, updated_at
          FROM areas
          WHERE parent_id = $1
          UNION ALL
          SELECT a.id, a.name, a.pcode, a.type, a.level, a.parent_id, a.geometry, a.metadata, a.created_at, a.updated_at
          FROM areas a
          INNER JOIN descendants d ON a.parent_id = d.id
        )
        SELECT * FROM descendants
        `,
        [areaId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        pcode: row.pcode,
        type: row.type,
        level: row.level,
        parentId: row.parent_id,
        geometry: row.geometry,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Bulk imports areas from HDX admin boundary format.
   *
   * Records are sorted by level before insertion to ensure parent areas exist
   * before their children. Parent references are resolved by pcode.
   *
   * @param data - Array of HDX area import records.
   * @returns Array of created area records.
   */
  async importFromHDX(data: HdxAreaImportRecord[]): Promise<AreaRecord[]> {
    // Sort by level to ensure parents are created before children
    const sorted = [...data].sort((a, b) => a.level - b.level);

    const pcodeToId = new Map<string, string>();
    const createdAreas: AreaRecord[] = [];

    for (const record of sorted) {
      let parentId: string | null = null;
      if (record.parentPcode) {
        parentId = pcodeToId.get(record.parentPcode) || null;
        if (!parentId) {
          // Try looking up in the database for pre-existing areas
          const existingParent = await this.getAreaByPcode(record.parentPcode);
          if (existingParent) {
            parentId = existingParent.id;
          } else {
            log.warn({ parentPcode: record.parentPcode, pcode: record.pcode }, "Parent area not found for import record");
          }
        }
      }

      const area = await this.createArea({
        name: record.name,
        pcode: record.pcode,
        type: record.type,
        level: record.level,
        parentId: parentId || undefined,
      });

      pcodeToId.set(record.pcode, area.id);
      createdAreas.push(area);
    }

    return createdAreas;
  }

  /**
   * Assigns an entity to an area by updating the entity's modified data
   * with an area_id field.
   *
   * @param entityGuid - The GUID of the entity to assign.
   * @param areaId - The ID of the area to assign the entity to.
   * @param tenantId - The tenant ID for multi-tenant isolation.
   */
  async assignEntityToArea(entityGuid: string, areaId: string, tenantId: string = "default"): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE entities
         SET modified = jsonb_set(
           COALESCE(modified, '{}'::jsonb),
           '{data,area_id}',
           to_jsonb($1::text),
           true
         ),
         last_updated = NOW()
         WHERE guid = $2 AND tenant_id = $3`,
        [areaId, entityGuid, tenantId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all root areas (areas with no parent).
   *
   * @returns Array of root area records.
   */
  async getRootAreas(): Promise<AreaRecord[]> {
    const result = await this.db
      .select()
      .from(areas)
      .where(isNull(areas.parentId));

    return result.map((row) => this.mapRow(row));
  }

  /**
   * Deletes an area and all its descendants.
   *
   * @param id - The area ID to delete.
   */
  async deleteArea(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Delete descendants first (bottom-up via CTE)
      await client.query(
        `
        WITH RECURSIVE descendants AS (
          SELECT id FROM areas WHERE parent_id = $1
          UNION ALL
          SELECT a.id FROM areas a INNER JOIN descendants d ON a.parent_id = d.id
        )
        DELETE FROM areas WHERE id IN (SELECT id FROM descendants)
        `,
        [id],
      );
      // Delete the area itself
      await client.query("DELETE FROM areas WHERE id = $1", [id]);
    } finally {
      client.release();
    }
  }

  /**
   * Clears all areas from the table.
   */
  async clearStore(): Promise<void> {
    await this.db.delete(areas);
  }

  /**
   * Closes the database connection pool.
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  private mapRow(row: typeof areas.$inferSelect): AreaRecord {
    return {
      id: row.id,
      name: row.name,
      pcode: row.pcode,
      type: row.type,
      level: row.level,
      parentId: row.parentId,
      geometry: row.geometry,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
