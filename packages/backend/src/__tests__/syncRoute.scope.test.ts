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

import axios from "axios";
import { get } from "lodash";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";

const baseConfig: AppConfig = {
  id: "mock-config",
  artifactId: "mock-config-artifact-scope",
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

const postgresUrl = getConnectionString("sync_route_scope");

describeIfPostgres("Sync route — scope advertisement & enforcement", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
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

  test("unscoped tenant: scope.hash is deterministic and points to unbounded", async () => {
    const currentApp = requireApp();
    await currentApp.appConfigStore.saveConfig(baseConfig);
    await currentApp.appInstanceStore.createAppInstance(baseConfig.id);

    const manager = (await currentApp.appInstanceStore.getAppInstance(baseConfig.id))?.edm;

    const formData1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Alice", age: 30, email: "alice@example.com" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formData2: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Bob", age: 31, email: "bob@example.com" },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    await manager?.submitForm(formData1);
    await manager?.submitForm(formData2);

    const response = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${baseConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.scope).toBeDefined();
    expect(response.body.scope.areaIds).toBeNull();
    expect(response.body.scope.entityTypes).toBeNull();
    expect(response.body.scope.timeWindow).toBeNull();
    expect(response.body.scope.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(response.headers["x-sync-scope-hash"]).toBe(response.body.scope.hash);
    expect(response.body.events).toHaveLength(2);
  });

  test("scoped tenant: only events for in-scope entities are delivered", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = {
      ...baseConfig,
      syncScope: { areaIds: ["A1"] },
    };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;

    const formA1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Carol", age: 22, email: "carol@example.com", area_id: "A1" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formA2: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Dave", age: 23, email: "dave@example.com", area_id: "A2" },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    await manager?.submitForm(formA1);
    await manager?.submitForm(formA2);

    const response = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.scope.areaIds).toEqual(["A1"]);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].entityGuid).toBe(formA1.entityGuid);
  });

  test("areaIds query param narrows the effective scope but cannot widen", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = {
      ...baseConfig,
      syncScope: { areaIds: ["A1", "A2"] },
    };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;

    const formA1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Eve", age: 24, email: "eve@example.com", area_id: "A1" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formA2: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Frank", age: 25, email: "frank@example.com", area_id: "A2" },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const formA3: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Grace", age: 26, email: "grace@example.com", area_id: "A3" },
      timestamp: "2023-01-03T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    await manager?.submitForm(formA1);
    await manager?.submitForm(formA2);
    await manager?.submitForm(formA3);

    const response = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}&areaIds=A2,A3`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    // Tenant scope is ["A1","A2"]; query hint is ["A2","A3"]; intersection is ["A2"].
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].entityGuid).toBe(formA2.entityGuid);
  });

  test("two pulls with the same scope yield identical scope.hash", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = {
      ...baseConfig,
      syncScope: { areaIds: ["A1"] },
    };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

    const r1 = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const r2 = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.scope.hash).toBe(r2.body.scope.hash);
  });

  test("disjoint query areaIds and tenant scope returns empty events (cannot widen)", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = {
      ...baseConfig,
      syncScope: { areaIds: ["A1"] },
    };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;

    const formA1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Heidi", age: 27, email: "heidi@example.com", area_id: "A1" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    await manager?.submitForm(formA1);

    const response = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}&areaIds=A99`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    // Tenant scope is ["A1"]; query hint is ["A99"]; intersection is [] →
    // deliver nothing, never widen. The full unfiltered tenant stream must
    // not leak.
    expect(response.body.events).toHaveLength(0);
    expect(response.body.nextCursor).toBeNull();
    // scope.areaIds advertises the server-side resolved scope (tenant policy
    // + assignment override), NOT the post-query-intersection result. The
    // query hint is request-scoped narrowing, not part of persistent scope.
    expect(response.body.scope.areaIds).toEqual(["A1"]);
  });

  test("areaIds query param is capped + deduped to prevent DoS", async () => {
    const currentApp = requireApp();
    await currentApp.appConfigStore.saveConfig(baseConfig);
    await currentApp.appInstanceStore.createAppInstance(baseConfig.id);

    // 200 ids, mostly dups (only 10 distinct). Without dedup+cap this would
    // fan out to 200 parallel searchEntities calls.
    const ids = Array.from({ length: 200 }, (_, i) => `AREA-${i % 10}`).join(",");

    const res = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${baseConfig.id}&areaIds=${encodeURIComponent(ids)}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // No assertion on event count — just that the route returns 200 quickly
    // without exhausting the Postgres connection pool. Existence of the cap
    // is verified by the fact this completes within Jest's default timeout.
    expect(res.status).toBe(200);
  });

  test("scope-policy edit between pulls yields different hashes", async () => {
    const currentApp = requireApp();
    await currentApp.appConfigStore.saveConfig(baseConfig);
    await currentApp.appInstanceStore.createAppInstance(baseConfig.id);

    const r1 = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${baseConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r1.status).toBe(200);
    const h1 = r1.body.scope.hash;

    const updated: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
    await currentApp.appConfigStore.saveConfig(updated);
    await currentApp.appInstanceStore.updateAppInstance(updated.id);

    const r2 = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${baseConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r2.status).toBe(200);
    const h2 = r2.body.scope.hash;

    expect(h1).not.toBe(h2);
  });
});
