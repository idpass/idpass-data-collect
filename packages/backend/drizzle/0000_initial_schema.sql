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

-- Initial schema for the backend database.
-- This migration creates all tables defined in src/db/schema.ts.
-- Run with: drizzle-kit migrate

-- ── users ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "tenant_ids" TEXT[] NOT NULL DEFAULT '{}',
  "role_assignments" JSONB DEFAULT '[]'
);

-- ── app_configs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_configs" (
  "id" TEXT PRIMARY KEY,
  "artifact_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT,
  "url" TEXT,
  "entity_forms" JSONB NOT NULL,
  "entity_data" JSONB,
  "external_sync" JSONB,
  "auth_configs" JSONB,
  "self_service" JSONB
);

-- ── otp_codes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "otp_codes" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "entity_guid" TEXT,
  "expires_at" TIMESTAMP NOT NULL,
  "attempts" INTEGER DEFAULT 0,
  "verified" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_otp_codes_identifier_tenant"
  ON "otp_codes" ("identifier", "tenant_id");

-- ── verifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "verifications" (
  "id" TEXT PRIMARY KEY,
  "submission_guid" TEXT NOT NULL,
  "entity_guid" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "duplicate_check_result" JSONB,
  "verified_by" TEXT,
  "verified_at" TIMESTAMP,
  "notes" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_verifications_submission_guid"
  ON "verifications" ("submission_guid");
CREATE INDEX IF NOT EXISTS "idx_verifications_tenant_id"
  ON "verifications" ("tenant_id");

-- ── submission_reviews ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "submission_reviews" (
  "id" TEXT PRIMARY KEY,
  "submission_guid" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "event_type" TEXT NOT NULL,
  "entity_guid" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_submission_reviews_tenant_id"
  ON "submission_reviews" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_submission_reviews_status"
  ON "submission_reviews" ("status");
CREATE INDEX IF NOT EXISTS "idx_submission_reviews_tenant_status"
  ON "submission_reviews" ("tenant_id", "status");

-- ── review_configs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "review_configs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "policy" TEXT NOT NULL,
  "required_role" TEXT,
  "external_adapter_type" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_review_configs_tenant_id"
  ON "review_configs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_review_configs_tenant_event"
  ON "review_configs" ("tenant_id", "event_type");
