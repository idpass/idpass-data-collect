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
import { SyncEventStore, SyncEventInput } from "../stores/SyncEventStore";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";

describeIfPostgres("SyncEventStore", () => {
  let pool: Pool;
  let store: SyncEventStore;
  const connectionString = getConnectionString("sync_event_store");

  beforeAll(async () => {
    await ensureDatabaseExists(connectionString);
    pool = new Pool({ connectionString });

    // Ensure tables exist
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_configs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          entity_forms JSONB NOT NULL DEFAULT '[]'
        )
      `);
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          job_id TEXT UNIQUE,
          phase VARCHAR(20),
          started_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ,
          error_message TEXT
        )
      `);
      await client.query(`
        INSERT INTO app_configs (id, name, entity_forms)
        VALUES ('test-config', 'Test Config', '[]')
        ON CONFLICT (id) DO NOTHING
      `);
    } finally {
      client.release();
    }

    store = new SyncEventStore(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM sync_events");
  });

  it("inserts and retrieves a sync event", async () => {
    const input: SyncEventInput = {
      configId: "test-config",
      status: "success",
      pushed: 10,
      pulled: 3,
      failed: 0,
      skipped: 0,
      durationMs: 2400,
      errors: null,
      triggeredBy: "admin@test.com",
    };

    const created = await store.insert(input);
    expect(created.id).toBeDefined();
    expect(created.status).toBe("success");
    expect(created.pushed).toBe(10);
    expect(created.triggeredBy).toBe("admin@test.com");
  });

  it("returns events newest first", async () => {
    await store.insert({
      configId: "test-config",
      status: "success",
      pushed: 5,
      pulled: 0,
      failed: 0,
      skipped: 0,
      durationMs: 1000,
      errors: null,
      triggeredBy: "admin@test.com",
    });
    await store.insert({
      configId: "test-config",
      status: "failed",
      pushed: 0,
      pulled: 0,
      failed: 3,
      skipped: 0,
      durationMs: 500,
      errors: [{ entityGuid: "abc", code: "500", message: "timeout" }],
      triggeredBy: "admin@test.com",
    });

    const events = await store.getByConfigId("test-config", 20);
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe("failed"); // newest first
    expect(events[1].status).toBe("success");
  });

  it("returns the most recent event", async () => {
    await store.insert({
      configId: "test-config",
      status: "success",
      pushed: 1,
      pulled: 0,
      failed: 0,
      skipped: 0,
      durationMs: 100,
      errors: null,
      triggeredBy: "admin@test.com",
    });

    const last = await store.getLastByConfigId("test-config");
    expect(last).not.toBeNull();
    expect(last!.status).toBe("success");
  });

  it("returns null when no events exist", async () => {
    const last = await store.getLastByConfigId("nonexistent");
    expect(last).toBeNull();
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await store.insert({
        configId: "test-config",
        status: "success",
        pushed: i,
        pulled: 0,
        failed: 0,
        skipped: 0,
        durationMs: 100,
        errors: null,
        triggeredBy: "admin@test.com",
      });
    }

    const events = await store.getByConfigId("test-config", 3);
    expect(events).toHaveLength(3);
  });
});
