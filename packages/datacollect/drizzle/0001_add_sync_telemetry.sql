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

-- Adds per-device sync telemetry tables.
-- These tables back the admin "Devices" view and per-device sync history.
-- Both are observability-only — they do not gate sync or scope enforcement.

-- ── device_sync_summary ────────────────────────────────────────────
-- One row per (tenant, user, device) tuple. UPSERTed on every sync
-- request to record last-seen and lifetime sync counts.
CREATE TABLE IF NOT EXISTS "device_sync_summary" (
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "last_pull_at" TIMESTAMP WITH TIME ZONE,
  "last_push_at" TIMESTAMP WITH TIME ZONE,
  "total_pulled" BIGINT NOT NULL DEFAULT 0,
  "total_pushed" BIGINT NOT NULL DEFAULT 0,
  "last_scope_hash" TEXT,
  PRIMARY KEY ("tenant_id", "user_id", "device_id")
);

-- ── sync_activity ──────────────────────────────────────────────────
-- Append-only audit log of /pull and /push requests. Pruned by a TTL
-- job (90 days default) and consulted by admin support tooling.
CREATE TABLE IF NOT EXISTS "sync_activity" (
  "id" BIGSERIAL PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "event_count" INTEGER NOT NULL,
  "scope_hash" TEXT,
  "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "sync_activity_tenant_occurred_idx"
  ON "sync_activity" ("tenant_id", "occurred_at");
