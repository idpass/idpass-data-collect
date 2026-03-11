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

import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { SyncLevel } from "@idpass/data-collect-core";
import { SyncServerInstance } from "../../types";
import {
  setup,
  teardown,
  describeIfPostgres,
  testAppConfig,
} from "./setup";

describeIfPostgres("Sync flow e2e", () => {
  let app: SyncServerInstance;
  let adminToken: string;
  let ctx: Awaited<ReturnType<typeof setup>> | undefined;

  beforeAll(async () => {
    ctx = await setup();
    app = ctx.app;
    adminToken = ctx.adminToken;

    // Create the test app config and instance
    await app.appConfigStore.saveConfig(testAppConfig);
    await app.appInstanceStore.createAppInstance(testAppConfig.id);
  });

  afterAll(async () => {
    await teardown(ctx);
  });

  describe("POST /api/sync/push", () => {
    it("pushes events and creates entities", async () => {
      const entityGuid = uuidv4();
      const events = [
        {
          guid: uuidv4(),
          entityGuid,
          type: "create-individual",
          data: { name: "Alice Test", age: 25 },
          timestamp: "2024-01-01T00:00:00.000Z",
          userId: "e2e-user",
          syncLevel: SyncLevel.LOCAL,
        },
      ];

      const res = await request(app.httpServer)
        .post("/api/sync/push")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ events, configId: testAppConfig.id });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "success" });

      // Verify entity was created
      const instance = await app.appInstanceStore.getAppInstance(testAppConfig.id);
      const entities = await instance?.edm.getAllEntities();
      expect(entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            guid: entityGuid,
          }),
        ]),
      );
    });

    it("pushes multiple events in one request", async () => {
      const events = [
        {
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: "Bob Test", age: 30 },
          timestamp: "2024-02-01T00:00:00.000Z",
          userId: "e2e-user",
          syncLevel: SyncLevel.LOCAL,
        },
        {
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: "Carol Test", age: 35 },
          timestamp: "2024-02-01T00:00:00.000Z",
          userId: "e2e-user",
          syncLevel: SyncLevel.LOCAL,
        },
      ];

      const res = await request(app.httpServer)
        .post("/api/sync/push")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ events, configId: testAppConfig.id });

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/sync/pull", () => {
    it("returns events since a given timestamp", async () => {
      const res = await request(app.httpServer)
        .get(`/api/sync/pull?since=2024-01-15T00:00:00.000Z&configId=${testAppConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("events");
      expect(Array.isArray(res.body.events)).toBe(true);
      // Should include Bob and Carol (created 2024-02-01) but not Alice (2024-01-01)
      const names = res.body.events.map((e: { data: { name: string } }) => e.data.name);
      expect(names).toContain("Bob Test");
      expect(names).toContain("Carol Test");
    });

    it("returns empty events for a future timestamp", async () => {
      const res = await request(app.httpServer)
        .get(`/api/sync/pull?since=2099-01-01T00:00:00.000Z&configId=${testAppConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });
  });

  describe("GET /api/entities/count", () => {
    it("returns the entity count for the config", async () => {
      const res = await request(app.httpServer)
        .get(`/api/entities/count?configId=${testAppConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // We pushed 3 individuals (Alice, Bob, Carol)
      expect(res.body).toHaveProperty("count");
      expect(res.body.count).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Full push-then-pull round trip", () => {
    it("pushed entity appears in subsequent pull", async () => {
      const entityGuid = uuidv4();
      const now = new Date().toISOString();

      await request(app.httpServer)
        .post("/api/sync/push")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          events: [
            {
              guid: uuidv4(),
              entityGuid,
              type: "create-group",
              data: { name: "E2E Household", entityName: "household" },
              timestamp: now,
              userId: "e2e-user",
              syncLevel: SyncLevel.LOCAL,
            },
          ],
          configId: testAppConfig.id,
        });

      const pullRes = await request(app.httpServer)
        .get(`/api/sync/pull?since=${encodeURIComponent("2020-01-01T00:00:00.000Z")}&configId=${testAppConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(pullRes.status).toBe(200);
      const guids = pullRes.body.events.map((e: { entityGuid: string }) => e.entityGuid);
      expect(guids).toContain(entityGuid);
    });
  });
});
