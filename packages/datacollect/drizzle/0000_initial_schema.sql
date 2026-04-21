-- Licensed to the Association pour la cooperation numerique (ACN) under one
-- or more contributor license agreements. See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership. The ACN licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License. You may obtain a copy of the License at
--
-- http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

-- Initial schema for the datacollect database.
-- This migration creates all tables defined in src/db/schema.ts.
-- Run with: drizzle-kit migrate

-- ── entities ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entities" (
  "id" TEXT NOT NULL,
  "guid" TEXT NOT NULL,
  "initial" JSONB,
  "modified" JSONB,
  "sync_level" TEXT,
  "last_updated" TIMESTAMP,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY ("id", "tenant_id"),
  UNIQUE ("guid", "tenant_id")
);

-- ── potential_duplicates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "potential_duplicates" (
  "entity_guid" TEXT NOT NULL,
  "duplicate_guid" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY ("entity_guid", "duplicate_guid", "tenant_id")
);

-- ── events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "events" (
  "guid" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "entity_guid" TEXT,
  "type" TEXT,
  "data" JSONB,
  "timestamp" TIMESTAMPTZ,
  "user_id" TEXT,
  "sync_level" INTEGER
);

CREATE INDEX IF NOT EXISTS "idx_events_tenant_id" ON "events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_events_timestamp" ON "events" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_events_entity_guid" ON "events" ("entity_guid");
CREATE INDEX IF NOT EXISTS "idx_events_tenant_timestamp" ON "events" ("tenant_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_events_sync_level" ON "events" ("sync_level");

-- ── audit_log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" SERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "action" TEXT,
  "guid" TEXT,
  "entity_guid" TEXT,
  "event_guid" TEXT,
  "changes" JSONB,
  "signature" TEXT,
  "user_id" TEXT,
  "timestamp" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_id" ON "audit_log" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity_guid" ON "audit_log" ("entity_guid");
CREATE INDEX IF NOT EXISTS "idx_audit_log_timestamp" ON "audit_log" ("timestamp");

-- ── sync_metadata ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sync_metadata" (
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "key" TEXT NOT NULL,
  "value" TEXT,
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("tenant_id", "key")
);

-- ── areas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "areas" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "pcode" TEXT UNIQUE,
  "type" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "parent_id" TEXT,
  "geometry" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_areas_parent_id" ON "areas" ("parent_id");
CREATE INDEX IF NOT EXISTS "idx_areas_level" ON "areas" ("level");
CREATE INDEX IF NOT EXISTS "idx_areas_type" ON "areas" ("type");
CREATE INDEX IF NOT EXISTS "idx_areas_pcode" ON "areas" ("pcode");

-- ── user_assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_assignments" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "area_id" TEXT REFERENCES "areas"("id"),
  "role" TEXT NOT NULL,
  "include_descendants" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_user_assignments_user_id" ON "user_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_assignments_tenant_id" ON "user_assignments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_user_assignments_area_id" ON "user_assignments" ("area_id");
CREATE INDEX IF NOT EXISTS "idx_user_assignments_user_tenant" ON "user_assignments" ("user_id", "tenant_id");

-- ── entity_overrides ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entity_overrides" (
  "id" TEXT PRIMARY KEY,
  "entity_guid" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_entity_overrides_user_id" ON "entity_overrides" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_entity_overrides_tenant_id" ON "entity_overrides" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_entity_overrides_entity_guid" ON "entity_overrides" ("entity_guid");
CREATE INDEX IF NOT EXISTS "idx_entity_overrides_user_tenant" ON "entity_overrides" ("user_id", "tenant_id");

-- ── entity_snapshots ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "entity_snapshots" (
  "id" TEXT PRIMARY KEY,
  "entity_guid" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "data" JSONB NOT NULL,
  "event_sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_entity_snapshots_entity_guid" ON "entity_snapshots" ("entity_guid");
CREATE INDEX IF NOT EXISTS "idx_entity_snapshots_tenant_id" ON "entity_snapshots" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_entity_snapshots_entity_tenant" ON "entity_snapshots" ("entity_guid", "tenant_id");
