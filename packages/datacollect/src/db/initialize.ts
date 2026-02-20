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
import { createLogger } from "../utils/logger";

const log = createLogger("db:initialize");

/**
 * Consolidates all datacollect CREATE TABLE statements into a single
 * initialization function. Runs all DDL in dependency order so that
 * individual storage adapter initialize() methods become lightweight.
 *
 * All statements use IF NOT EXISTS so this function is idempotent and
 * safe to call on every startup.
 *
 * Table order:
 *   1. entities             (core entity storage)
 *   2. potential_duplicates (duplicate detection)
 *   3. events               (event sourcing)
 *   4. audit_log            (audit trail)
 *   5. sync_metadata        (sync timestamps)
 *   6. areas                (geographic hierarchy)
 *   7. user_assignments     (RBAC area assignments, depends on areas)
 *   8. entity_overrides     (per-entity access overrides)
 *   9. entity_snapshots     (event sourcing optimization)
 */
export async function initializeDatacollectDatabase(postgresUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: postgresUrl });
  const client = await pool.connect();

  try {
    log.info("Initializing datacollect database schema");

    // ── 1. entities ───────────────────────────────────────────────────
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

    // ── 2. potential_duplicates ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS potential_duplicates (
        entity_guid TEXT,
        duplicate_guid TEXT,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        PRIMARY KEY (entity_guid, duplicate_guid, tenant_id)
      )
    `);

    // ── 3. events ─────────────────────────────────────────────────────
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
    await client.query("CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_events_entity_guid ON events(entity_guid)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_events_tenant_timestamp ON events(tenant_id, timestamp)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_events_sync_level ON events(sync_level)");

    // ── 4. audit_log ──────────────────────────────────────────────────
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
    await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_entity_guid ON audit_log(entity_guid)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)");

    // ── 5. sync_metadata ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        tenant_id TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (tenant_id, key)
      )
    `);

    // ── 6. areas ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pcode TEXT UNIQUE,
        type TEXT NOT NULL,
        level INTEGER NOT NULL,
        parent_id TEXT,
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

    // ── 7. user_assignments ───────────────────────────────────────────
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

    // ── 8. entity_overrides ───────────────────────────────────────────
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

    // ── 9. entity_snapshots ───────────────────────────────────────────
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

    log.info("Datacollect database schema initialized successfully");
  } finally {
    client.release();
    await pool.end();
  }
}
