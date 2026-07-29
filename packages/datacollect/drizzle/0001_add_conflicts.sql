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

-- Adds the conflicts table that backs the Postgres ConflictStore.
-- Mirrors the canonical definition in src/db/schema.ts. The runtime backend
-- table create is in packages/backend/drizzle/0003_add_conflicts.sql.

CREATE TABLE IF NOT EXISTS "conflicts" (
  "guid" TEXT PRIMARY KEY,
  "entity_guid" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "local_version" JSONB NOT NULL,
  "remote_version" JSONB NOT NULL,
  "local_event_guid" TEXT NOT NULL,
  "remote_event_guid" TEXT NOT NULL,
  "detected_at" TIMESTAMPTZ NOT NULL,
  "resolved_at" TIMESTAMPTZ,
  "resolution" TEXT,
  "resolved_by" TEXT,
  "merged_data" JSONB
);

CREATE INDEX IF NOT EXISTS "conflicts_tenant_resolved_idx"
  ON "conflicts" ("tenant_id", "resolved_at");
CREATE INDEX IF NOT EXISTS "conflicts_entity_idx"
  ON "conflicts" ("tenant_id", "entity_guid");
