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

import "dotenv/config";

import * as fs from "fs";
import * as path from "path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { deviceSyncSummary, syncActivity } from "@idpass/data-collect-core";
import { SyncTelemetryStore } from "../SyncTelemetryStore";

const SUITE_SUFFIX = "sync_telemetry_store";

const getConnectionString = (): string => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_${SUITE_SUFFIX}` : `datacollect_${SUITE_SUFFIX}`;
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const ensureDatabaseExists = async (connectionString: string): Promise<void> => {
  if (!connectionString) return;
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (result.rowCount === 0) {
      const escapedName = dbName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${escapedName}"`);
    }
  } finally {
    await client.end();
  }
};

const applyTelemetryMigration = async (pool: Pool): Promise<void> => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../../datacollect/drizzle/0001_add_sync_telemetry.sql",
  );
  const sqlText = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sqlText);
};

const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

describeIfPostgres("SyncTelemetryStore", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let store: SyncTelemetryStore;

  beforeAll(async () => {
    await ensureDatabaseExists(getConnectionString());
    pool = new Pool({ connectionString: getConnectionString() });
    await applyTelemetryMigration(pool);
    db = drizzle(pool);
    store = new SyncTelemetryStore(pool);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE device_sync_summary`);
    await db.execute(sql`TRUNCATE sync_activity`);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("recordPull upserts summary and appends activity", async () => {
    await store.recordPull({
      tenantId: "t1",
      userId: "u1",
      deviceId: "d1",
      eventCount: 5,
      scopeHash: null,
    });

    const summaries = await db.select().from(deviceSyncSummary);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      tenantId: "t1",
      userId: "u1",
      deviceId: "d1",
      totalPulled: 5,
      totalPushed: 0,
    });
    expect(summaries[0].lastPullAt).toBeInstanceOf(Date);

    const activity = await db.select().from(syncActivity);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      tenantId: "t1",
      userId: "u1",
      deviceId: "d1",
      route: "pull",
      eventCount: 5,
    });
  });

  test("recordPush upserts summary and appends activity", async () => {
    await store.recordPush({
      tenantId: "t1",
      userId: "u1",
      deviceId: "d1",
      eventCount: 3,
      scopeHash: null,
    });

    const [summary] = await db.select().from(deviceSyncSummary);
    expect(summary.totalPushed).toBe(3);
    expect(summary.totalPulled).toBe(0);
    expect(summary.lastPushAt).toBeInstanceOf(Date);
  });

  test("multiple pulls accumulate counts", async () => {
    await store.recordPull({ tenantId: "t1", userId: "u1", deviceId: "d1", eventCount: 5, scopeHash: null });
    await store.recordPull({ tenantId: "t1", userId: "u1", deviceId: "d1", eventCount: 7, scopeHash: null });

    const [summary] = await db.select().from(deviceSyncSummary);
    expect(summary.totalPulled).toBe(12);

    const activity = await db.select().from(syncActivity);
    expect(activity).toHaveLength(2);
  });

  test("different devices for same user keep separate summaries", async () => {
    await store.recordPull({ tenantId: "t1", userId: "u1", deviceId: "d1", eventCount: 5, scopeHash: null });
    await store.recordPull({ tenantId: "t1", userId: "u1", deviceId: "d2", eventCount: 8, scopeHash: null });

    const summaries = await db.select().from(deviceSyncSummary);
    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.deviceId === "d1")?.totalPulled).toBe(5);
    expect(summaries.find((s) => s.deviceId === "d2")?.totalPulled).toBe(8);
  });

  test("tenant isolation — listSummariesForTenant excludes other tenants", async () => {
    await store.recordPull({ tenantId: "t1", userId: "u1", deviceId: "d1", eventCount: 5, scopeHash: null });
    await store.recordPull({ tenantId: "t2", userId: "u1", deviceId: "d1", eventCount: 3, scopeHash: null });

    const t1Summaries = await store.listSummariesForTenant("t1");
    expect(t1Summaries).toHaveLength(1);
    expect(t1Summaries[0].tenantId).toBe("t1");
  });
});
