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
import jwt from "jsonwebtoken";
import { get } from "lodash";
import { Pool } from "pg";
import request from "supertest";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";

const mockConfig: AppConfig = {
  id: "mock-config",
  artifactId: "mock-config-artifact-admin-devices",
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

const postgresUrl = getConnectionString("admin_devices_route");

const applyTelemetryMigration = async (pool: Pool): Promise<void> => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../datacollect/drizzle/0001_add_sync_telemetry.sql",
  );
  const sqlText = await fs.readFile(migrationPath, "utf8");
  await pool.query(sqlText);
};

describeIfPostgres("GET /api/admin/devices", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
  let telemetryPool: Pool;
  let adminToken = "";
  let nonAdminToken = "";

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

    // Mint a non-admin token directly to avoid creating a full user record.
    nonAdminToken = jwt.sign(
      {
        id: "non-admin-1",
        email: "user@example.com",
        role: "USER",
        tenantIds: [mockConfig.id],
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
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

  test("returns summaries for the requested tenant only", async () => {
    await telemetryPool.query(
      `INSERT INTO device_sync_summary
       (tenant_id, user_id, device_id, total_pulled, total_pushed)
       VALUES ($1, $2, $3, $4, $5), ($1, $2, $6, $7, $8), ($9, $2, $3, $10, $11)`,
      [mockConfig.id, "u1", "d1", 5, 2, "d2", 3, 0, "other-tenant", 99, 99],
    );

    const currentApp = requireApp();
    const res = await request(currentApp.httpServer)
      .get(`/api/admin/devices?configId=${mockConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((row: { tenantId: string }) => row.tenantId === mockConfig.id)).toBe(true);

    const d2 = res.body.find((r: { deviceId: string }) => r.deviceId === "d2");
    expect(d2.totalPulled).toBe(3);
    expect(typeof d2.totalPulled).toBe("number");
  });

  test("rejects non-admin role with 403", async () => {
    const currentApp = requireApp();
    const res = await request(currentApp.httpServer)
      .get(`/api/admin/devices?configId=${mockConfig.id}`)
      .set("Authorization", `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
  });

  test("rejects request without configId with 400", async () => {
    const currentApp = requireApp();
    const res = await request(currentApp.httpServer)
      .get(`/api/admin/devices`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});
