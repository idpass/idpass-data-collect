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
 * Consolidates all backend CREATE TABLE statements into a single initialization
 * function. Runs all DDL in dependency order so that individual store initialize()
 * methods become lightweight verification steps.
 *
 * All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so this function
 * is safe to call on every server startup (idempotent).
 *
 * Table order:
 *   1. users               (no dependencies)
 *   2. app_configs          (no dependencies)
 *   3. otp_codes            (no dependencies)
 *   4. verifications        (no dependencies)
 *   5. submission_reviews   (no dependencies)
 *   6. review_configs       (no dependencies)
 */
export async function initializeDatabase(postgresUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: postgresUrl });
  const client = await pool.connect();

  try {
    log.info("Initializing backend database schema");

    // ── 1. users ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        tenant_ids TEXT[] NOT NULL DEFAULT '{}',
        role_assignments JSONB DEFAULT '[]'
      )
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_ids TEXT[] NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role_assignments JSONB DEFAULT '[]'`);

    // ── 2. app_configs ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_configs (
        id TEXT PRIMARY KEY,
        artifact_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        url TEXT,
        entity_forms JSONB NOT NULL,
        entity_data JSONB,
        external_sync JSONB,
        auth_configs JSONB,
        self_service JSONB
      )
    `);
    await client.query(`ALTER TABLE app_configs ADD COLUMN IF NOT EXISTS artifact_id TEXT`);
    await client.query(`ALTER TABLE app_configs ADD COLUMN IF NOT EXISTS self_service JSONB`);

    // ── 3. otp_codes ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        code TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        entity_guid TEXT,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_otp_codes_identifier_tenant
      ON otp_codes (identifier, tenant_id)
    `);

    // ── 4. verifications ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        submission_guid TEXT NOT NULL,
        entity_guid TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        duplicate_check_result JSONB,
        verified_by TEXT,
        verified_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_verifications_submission_guid
      ON verifications (submission_guid)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_verifications_tenant_id
      ON verifications (tenant_id)
    `);

    // ── 5. submission_reviews ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS submission_reviews (
        id TEXT PRIMARY KEY,
        submission_guid TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        rejection_reason TEXT,
        event_type TEXT NOT NULL,
        entity_guid TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_reviews_tenant_id
      ON submission_reviews (tenant_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_reviews_status
      ON submission_reviews (status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_reviews_tenant_status
      ON submission_reviews (tenant_id, status)
    `);

    // ── 6. review_configs ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_configs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        policy TEXT NOT NULL,
        required_role TEXT,
        external_adapter_type TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, event_type)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_review_configs_tenant_id
      ON review_configs (tenant_id)
    `);
    // Ensure the unique constraint exists for ON CONFLICT upserts in ReviewStore.
    // Uses CREATE UNIQUE INDEX to handle tables created before this constraint was added.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_review_configs_tenant_event_unique
      ON review_configs (tenant_id, event_type)
    `);

    // ── 7. sync_events ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_events (
        id SERIAL PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES app_configs(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        pushed INTEGER NOT NULL DEFAULT 0,
        pulled INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        errors JSONB,
        triggered_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_events_config_id
      ON sync_events (config_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_events_created_at
      ON sync_events (created_at DESC)
    `);

    // ── 7b. sync_events async columns ────────────────────────────────
    await client.query(`ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS job_id TEXT UNIQUE`);
    await client.query(`ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS phase VARCHAR(20)`);
    await client.query(`ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS error_message TEXT`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_events_job_id
      ON sync_events (job_id) WHERE job_id IS NOT NULL
    `);

    log.info("Backend database schema initialized successfully");
  } finally {
    client.release();
    await pool.end();
  }
}
