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

import * as fs from "fs/promises";
import * as path from "path";
import axios from "axios";
import { get } from "lodash";
import { Pool } from "pg";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";

const mockConfig: AppConfig = {
  id: "mock-config",
  artifactId: "mock-config-artifact-telemetry",
  name: "Mock Config",
  description: "Mock Config Description",
  version: "1.0.0",
  url: "http://localhost:3000",
  entityForms: [
    {
      id: "mock-entityform",
      title: "Mock Entityform",
      formio: { components: [] },
      name: "Mock Entityform",
      dependsOn: "",
    },
  ],
};

const postgresUrl = getConnectionString("sync_route_telemetry");

const applyTelemetryMigration = async (pool: Pool): Promise<void> => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../datacollect/drizzle/0001_add_sync_telemetry.sql",
  );
  const sqlText = await fs.readFile(migrationPath, "utf8");
  await pool.query(sqlText);
};

describeIfPostgres("Sync route — telemetry", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
  let telemetryPool: Pool;
  let adminToken = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) {
      throw new Error("Sync server instance is not initialized");
    }
    return app;
  };

  const resolveBaseUrl = (instance: SyncServerInstance): string => {
    const address = instance.httpServer.address();
    if (typeof address === "object" && address && address.port) {
      return `http://127.0.0.1:${address.port}`;
    }
    return "http://127.0.0.1";
  };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-secret";
    }
    await ensureDatabaseExists(postgresUrl);
    telemetryPool = new Pool({ connectionString: postgresUrl });
    await applyTelemetryMigration(telemetryPool);
  });

  afterAll(async () => {
    await telemetryPool.end();
  });

  beforeEach(async () => {
    if (app) {
      await requireApp().closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin1@",
      adminEmail: "admin@example.com",
      postgresUrl: postgresUrl as string,
    });
    const currentApp = requireApp();
    baseUrl = resolveBaseUrl(currentApp);
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);

    // Truncate telemetry tables for a clean slate
    await telemetryPool.query("TRUNCATE device_sync_summary");
    await telemetryPool.query("TRUNCATE sync_activity");

    const loginRes = await axios.post(baseUrl + "/api/users/login", {
      email: "admin@example.com",
      password: "admin1@",
    });
    adminToken = get(loginRes.data, "token") ?? "";
  });

  afterEach(async () => {
    if (!app) {
      return;
    }
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  test("GET /pull records telemetry when X-Device-Id present", async () => {
    const currentApp = requireApp();
    const res = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${mockConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-abc");

    expect(res.status).toBe(200);

    const summaries = await telemetryPool.query(
      "SELECT * FROM device_sync_summary WHERE tenant_id = $1",
      [mockConfig.id],
    );
    expect(summaries.rows).toHaveLength(1);
    expect(summaries.rows[0]).toMatchObject({
      tenant_id: mockConfig.id,
      device_id: "device-abc",
    });

    const activity = await telemetryPool.query(
      "SELECT * FROM sync_activity WHERE tenant_id = $1",
      [mockConfig.id],
    );
    expect(activity.rows).toHaveLength(1);
    expect(activity.rows[0].route).toBe("pull");
  });

  test("GET /pull without X-Device-Id does not record telemetry", async () => {
    const currentApp = requireApp();
    const res = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${mockConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const summaries = await telemetryPool.query("SELECT * FROM device_sync_summary");
    expect(summaries.rows).toHaveLength(0);

    const activity = await telemetryPool.query("SELECT * FROM sync_activity");
    expect(activity.rows).toHaveLength(0);
  });

  test("event_count reflects payload size", async () => {
    const currentApp = requireApp();
    const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;

    const formData1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Alpha", age: 11, email: "a@example.com" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formData2: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Bravo", age: 22, email: "b@example.com" },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formData3: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Charlie", age: 33, email: "c@example.com" },
      timestamp: "2023-01-03T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager?.submitForm(formData1);
    await manager?.submitForm(formData2);
    await manager?.submitForm(formData3);

    const res = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${mockConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-abc");

    expect(res.status).toBe(200);

    const summaries = await telemetryPool.query(
      "SELECT * FROM device_sync_summary WHERE tenant_id = $1",
      [mockConfig.id],
    );
    expect(summaries.rows).toHaveLength(1);
    // bigint comes back as string from raw pg
    expect(summaries.rows[0].total_pulled).toBe("3");
  });
});
