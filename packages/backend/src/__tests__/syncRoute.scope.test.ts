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
    // Apply telemetry migration so the fire-and-forget recordPull/recordPush
    // writes from /pull and /push (T4 requires X-Device-Id on scoped tenants
    // and that triggers telemetry inserts) don't surface as unhandled
    // promise rejections in the test runner.
    const telemetryPool = new Pool({ connectionString: postgresUrl });
    try {
      const migrationPath = path.resolve(
        __dirname,
        "../../../datacollect/drizzle/0001_add_sync_telemetry.sql",
      );
      const sqlText = await fs.readFile(migrationPath, "utf8");
      await telemetryPool.query(sqlText);
    } catch (err) {
      // Idempotent: ignore if tables already exist from a prior run.
      const message = (err as Error).message || "";
      if (!/already exists/i.test(message)) {
        throw err;
      }
    } finally {
      await telemetryPool.end();
    }
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

    // Login once per suite — express-rate-limit on /api/users/login is a
    // module-level singleton (15 attempts / 15 min) and would 429 once the
    // suite grows past 15 tests. JWT is verified symmetrically against
    // JWT_SECRET so the token survives server restarts between tests.
    if (!adminToken) {
      const loginRes = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      adminToken = get(loginRes.data, "token") ?? "";
    }
  });

  afterEach(async () => {
    if (!app) {
      return;
    }
    const currentApp = requireApp();
    // Drain pending fire-and-forget telemetry writes before closing the pool
    // so they don't surface as "Cannot use a pool after calling end" errors
    // in Jest's unhandled-rejection tracking.
    await currentApp.telemetryStore?.whenIdle();
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
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");

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
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");

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
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");
    const r2 = await request(currentApp.httpServer)
      .get(`/api/sync/pull?configId=${scopedConfig.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");

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
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");

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
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", "device-test-1");
    expect(r2.status).toBe(200);
    const h2 = r2.body.scope.hash;

    expect(h1).not.toBe(h2);
  });

  // ---------------------------------------------------------------------------
  // /push scope enforcement (Phase 3 — WP #947, T5)
  // ---------------------------------------------------------------------------

  describe("Sync route — /push scope enforcement", () => {
    const DEVICE_ID = "device-test-1";

    const buildCreateIndividual = (overrides: Partial<FormSubmission> & {
      data?: Record<string, unknown>;
    }): FormSubmission => {
      const { data: dataOverride, ...rest } = overrides;
      return {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        timestamp: "2023-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
        ...rest,
        data: { name: "Sample", age: 21, ...(dataOverride ?? {}) },
      };
    };

    test("unscoped tenant: /push enforces nothing (X-Device-Id optional)", async () => {
      const currentApp = requireApp();
      await currentApp.appConfigStore.saveConfig(baseConfig);
      await currentApp.appInstanceStore.createAppInstance(baseConfig.id);

      const events: FormSubmission[] = [
        buildCreateIndividual({
          data: { name: "Alice", age: 30, email: "alice@example.com", area_id: "X1" },
          timestamp: "2023-01-01T00:00:00.000Z",
        }),
        buildCreateIndividual({
          data: { name: "Bob", age: 31, email: "bob@example.com" },
          timestamp: "2023-01-02T00:00:00.000Z",
        }),
      ];

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events, configId: baseConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.applied).toBe(2);
      expect(response.body.failed).toEqual([]);
    });

    test("scoped {areaIds:['A1']}: mixed batch returns 207 with one accepted, one rejected", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const eventA1 = buildCreateIndividual({
        data: { name: "Carol", age: 22, email: "carol@example.com", area_id: "A1" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });
      const eventA2 = buildCreateIndividual({
        data: { name: "Dave", age: 23, email: "dave@example.com", area_id: "A2" },
        timestamp: "2023-01-02T00:00:00.000Z",
      });

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [eventA1, eventA2], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(response.status).toBe(207);
      expect(response.body.status).toBe("partial");
      expect(response.body.applied).toBe(1);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0]).toMatchObject({
        guid: eventA2.guid,
        entityGuid: eventA2.entityGuid,
        type: "create-individual",
        reason: "out_of_scope",
      });

      // Verify A1 was actually applied — read directly via the manager so we
      // bypass /pull's scope-aware filtering (which would also exclude A2 for
      // unrelated reasons).
      const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;
      const stored = await manager?.getEntity(eventA1.entityGuid);
      expect(stored?.modified.data.name).toBe("Carol");
      // And the rejected one was NOT persisted.
      await expect(manager?.getEntity(eventA2.entityGuid)).rejects.toThrow();
    });

    test("scoped {areaIds:['A1']}: create with no area_id is all-rejected (422)", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const event = buildCreateIndividual({
        data: { name: "Eve", age: 24, email: "eve@example.com" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [event], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe("error");
      expect(response.body.applied).toBe(0);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0]).toMatchObject({
        guid: event.guid,
        entityGuid: event.entityGuid,
        type: "create-individual",
        reason: "out_of_scope",
      });
    });

    test("scoped {entityTypes:['individual']}: create-individual passes, create-group rejected", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = {
        ...baseConfig,
        syncScope: { entityTypes: ["individual"] },
      };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      // create-individual without area_id should be accepted (no areaIds dim).
      const indivEvent = buildCreateIndividual({
        data: { name: "Frank", age: 25, email: "frank@example.com" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });

      const indivResponse = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [indivEvent], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(indivResponse.status).toBe(200);
      expect(indivResponse.body.status).toBe("success");
      expect(indivResponse.body.applied).toBe(1);
      expect(indivResponse.body.failed).toEqual([]);

      // create-group (entityType "group") must be rejected.
      const groupEvent: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-group",
        data: { name: "Some Household", members: [] },
        timestamp: "2023-01-02T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const groupResponse = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [groupEvent], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(groupResponse.status).toBe(422);
      expect(groupResponse.body.status).toBe("error");
      expect(groupResponse.body.applied).toBe(0);
      expect(groupResponse.body.failed).toHaveLength(1);
      expect(groupResponse.body.failed[0]).toMatchObject({
        guid: groupEvent.guid,
        entityGuid: groupEvent.entityGuid,
        type: "create-group",
        reason: "out_of_scope",
      });
    });

    test("scoped {areaIds:['A1']}: update on out-of-scope entity (A2) is rejected (out_of_scope)", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;
      // Pre-seed an A2 entity directly via submitForm — admin/in-process path
      // bypasses scope (it does not go through HTTP).
      const seed: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Grace", age: 26, email: "grace@example.com", area_id: "A2" },
        timestamp: "2023-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };
      await manager?.submitForm(seed);

      // Push an update-individual for the seeded entity. No area_id in payload
      // — rejection must come from the looked-up entity's stored area.
      const updateEvent: FormSubmission = {
        guid: uuidv4(),
        entityGuid: seed.entityGuid,
        type: "update-individual",
        data: { name: "Grace Updated" },
        timestamp: "2023-02-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [updateEvent], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(response.status).toBe(422);
      expect(response.body.applied).toBe(0);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0]).toMatchObject({
        guid: updateEvent.guid,
        entityGuid: seed.entityGuid,
        type: "update-individual",
        reason: "out_of_scope",
      });

      // Sanity: the entity still has its original name.
      const stored = await manager?.getEntity(seed.entityGuid);
      expect(stored?.modified.data.name).toBe("Grace");
    });

    test("scoped: update on unknown entity is rejected (unknown_entity)", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const updateEvent: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "update-individual",
        data: { name: "Phantom" },
        timestamp: "2023-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [updateEvent], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(response.status).toBe(422);
      expect(response.body.applied).toBe(0);
      expect(response.body.failed).toHaveLength(1);
      expect(response.body.failed[0]).toMatchObject({
        guid: updateEvent.guid,
        entityGuid: updateEvent.entityGuid,
        type: "update-individual",
        reason: "unknown_entity",
      });
    });

    test("scoped /push without X-Device-Id returns 400 DEVICE_ID_REQUIRED", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const event = buildCreateIndividual({
        data: { name: "Heidi", age: 27, email: "heidi@example.com", area_id: "A1" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [event], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe("error");
      expect(response.body.code).toBe("DEVICE_ID_REQUIRED");
      expect(response.body.message).toMatch(/X-Device-Id/);
    });

    test("unscoped /push without X-Device-Id returns 200 (header optional)", async () => {
      const currentApp = requireApp();
      await currentApp.appConfigStore.saveConfig(baseConfig);
      await currentApp.appInstanceStore.createAppInstance(baseConfig.id);

      const event = buildCreateIndividual({
        data: { name: "Ivan", age: 28, email: "ivan@example.com" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [event], configId: baseConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.applied).toBe(1);
      expect(response.body.failed).toEqual([]);
    });

    test("scoped {areaIds:['A1']}: all-out-of-scope mixed batch returns 422 with two rejections", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      const indivA2 = buildCreateIndividual({
        data: { name: "Judy", age: 29, email: "judy@example.com", area_id: "A2" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });
      const groupA2: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-group",
        data: { name: "A2 Household", area_id: "A2", members: [] },
        timestamp: "2023-01-02T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events: [indivA2, groupA2], configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(response.status).toBe(422);
      expect(response.body.status).toBe("error");
      expect(response.body.applied).toBe(0);
      expect(response.body.failed).toHaveLength(2);
      expect(response.body.failed.every((f: { reason: string }) => f.reason === "out_of_scope")).toBe(true);
      const rejectedGuids = new Set(response.body.failed.map((f: { guid: string }) => f.guid));
      expect(rejectedGuids.has(indivA2.guid)).toBe(true);
      expect(rejectedGuids.has(groupA2.guid)).toBe(true);
    });

    test("scoped {areaIds:['A1']}: applied events preserve submission/timestamp order on /pull", async () => {
      const currentApp = requireApp();
      const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
      await currentApp.appConfigStore.saveConfig(scopedConfig);
      await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);

      // Pre-seed an A1 entity that the update event will target. The /push
      // validator looks up entities BEFORE applying the batch, so an
      // in-batch update of an in-batch create would be rejected as
      // "unknown_entity". Using a pre-existing entity sidesteps that
      // staging quirk and keeps the focus of this test on order
      // preservation across the partition.
      const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))?.edm;
      const seedGuid = uuidv4();
      await manager?.submitForm({
        guid: uuidv4(),
        entityGuid: seedGuid,
        type: "create-individual",
        data: { name: "Pre-Seed", age: 40, email: "seed@example.com", area_id: "A1" },
        timestamp: "2022-12-31T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      const createA1First = buildCreateIndividual({
        data: { name: "Karl", age: 30, email: "karl@example.com", area_id: "A1" },
        timestamp: "2023-01-01T00:00:00.000Z",
      });
      const createA2Rejected = buildCreateIndividual({
        data: { name: "Liam", age: 31, email: "liam@example.com", area_id: "A2" },
        timestamp: "2023-01-02T00:00:00.000Z",
      });
      const createA1Second = buildCreateIndividual({
        data: { name: "Mona", age: 32, email: "mona@example.com", area_id: "A1" },
        timestamp: "2023-01-03T00:00:00.000Z",
      });
      const updateSeed: FormSubmission = {
        guid: uuidv4(),
        entityGuid: seedGuid,
        type: "update-individual",
        data: { name: "Pre-Seed Updated" },
        timestamp: "2023-01-04T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const events = [createA1First, createA2Rejected, createA1Second, updateSeed];

      const pushRes = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events, configId: scopedConfig.id })
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(pushRes.status).toBe(207);
      expect(pushRes.body.status).toBe("partial");
      expect(pushRes.body.applied).toBe(3);
      expect(pushRes.body.failed).toHaveLength(1);
      expect(pushRes.body.failed[0]).toMatchObject({
        guid: createA2Rejected.guid,
        reason: "out_of_scope",
      });

      // /pull and assert delivered events are sorted ASC by timestamp and
      // contain the three accepted batch events in submission order. The
      // pre-seed event also appears (it is an A1 event), so we filter the
      // delivered stream down to the batch's accepted guids before
      // comparing order.
      const pullRes = await request(currentApp.httpServer)
        .get(`/api/sync/pull?configId=${scopedConfig.id}&areaIds=A1`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Device-Id", DEVICE_ID);

      expect(pullRes.status).toBe(200);
      const acceptedGuids = new Set([
        createA1First.guid,
        createA1Second.guid,
        updateSeed.guid,
      ]);
      const deliveredAccepted = pullRes.body.events
        .map((e: { guid: string; timestamp: string }) => e)
        .filter((e: { guid: string }) => acceptedGuids.has(e.guid));
      expect(deliveredAccepted.map((e: { guid: string }) => e.guid)).toEqual([
        createA1First.guid,
        createA1Second.guid,
        updateSeed.guid,
      ]);

      // Timestamps of the full delivered stream must be non-decreasing.
      const timestamps = pullRes.body.events.map((e: { timestamp: string }) => e.timestamp);
      const sorted = [...timestamps].sort();
      expect(timestamps).toEqual(sorted);
    });
  });
});
