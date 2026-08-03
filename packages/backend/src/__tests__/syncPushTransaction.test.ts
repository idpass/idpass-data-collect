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
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

const mockConfig: AppConfig = {
  id: "txn-test-config",
  artifactId: "txn-test-artifact",
  name: "Transaction Test Config",
  description: "Config for transactional push tests",
  version: "1.0.0",
  url: "http://localhost:3000",
  entityForms: [
    {
      id: "txn-entityform",
      title: "Txn Entityform",
      formio: { components: [] },
      name: "Txn Entityform",
      dependsOn: "",
    },
  ],
};

const postgresUrl = getConnectionString("txn_push");

describeIfPostgres("Transactional Sync Push", () => {
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
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);

    const loginResponse = await axios.post(baseUrl + "/api/users/login", {
      email: "admin@example.com",
      password: "admin1@",
    });
    adminToken = get(loginResponse.data, "token") ?? "";
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

  it("should commit all events on successful batch", async () => {
    const currentApp = requireApp();
    const entityGuid1 = uuidv4();
    const entityGuid2 = uuidv4();
    const entityGuid3 = uuidv4();

    const events: FormSubmission[] = [
      {
        guid: uuidv4(),
        entityGuid: entityGuid1,
        type: "create-individual",
        data: { name: "Alice", age: 25 },
        timestamp: "2024-01-01T00:00:01.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: uuidv4(),
        entityGuid: entityGuid2,
        type: "create-individual",
        data: { name: "Bob", age: 30 },
        timestamp: "2024-01-01T00:00:02.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: uuidv4(),
        entityGuid: entityGuid3,
        type: "create-individual",
        data: { name: "Charlie", age: 35 },
        timestamp: "2024-01-01T00:00:03.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events, configId: mockConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "success",
      applied: 3,
    });
    expect(response.body.failed).toEqual([]);

    // Verify entities were persisted via a fresh read through the main EDM
    // (which uses its own pool, NOT the transactional one)
    const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
    const allEntities = await manager?.getAllEntities();
    expect(allEntities).toHaveLength(3);

    const names = allEntities?.map((e) => e.modified.data.name).sort();
    expect(names).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("strips client-supplied externalId/identifierType from pushed events (H11/H30)", async () => {
    const currentApp = requireApp();
    const entityGuid = uuidv4();

    const events: FormSubmission[] = [
      {
        guid: uuidv4(),
        entityGuid,
        type: "create-individual",
        data: {
          name: "Mallory",
          // Attacker attempts to bind this entity to a victim's external record.
          externalId: "victim-openspp-id",
          identifierType: "national_id",
        },
        timestamp: "2024-01-01T00:00:01.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events, configId: mockConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "success", applied: 1 });

    const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
    const entity = await manager?.getEntity(entityGuid);

    // The forbidden fields must not reach the entity by any path.
    expect(entity?.modified.externalId).toBeUndefined();
    expect(entity?.modified.data.externalId).toBeUndefined();
    expect(entity?.modified.data.identifierType).toBeUndefined();
    // Legitimate data is preserved.
    expect(entity?.modified.data.name).toBe("Mallory");
  });

  it("should rollback all events when one fails", async () => {
    const currentApp = requireApp();
    const entityGuid1 = uuidv4();
    const entityGuid2 = uuidv4();

    const events: FormSubmission[] = [
      {
        guid: uuidv4(),
        entityGuid: entityGuid1,
        type: "create-individual",
        data: { name: "Alice", age: 25 },
        timestamp: "2024-01-01T00:00:01.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: uuidv4(),
        entityGuid: entityGuid2,
        type: "create-individual",
        data: { name: "Bob", age: 30 },
        timestamp: "2024-01-01T00:00:02.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        // This event references a non-existent group for add-member,
        // which will fail because the group does not exist
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "add-member",
        data: { members: [{ guid: uuidv4(), name: "Dangling", type: "individual" }] },
        timestamp: "2024-01-01T00:00:03.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events, configId: mockConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(422);
    expect(response.body.status).toBe("error");
    expect(response.body.applied).toBe(0);
    expect(response.body.failed).toHaveLength(1);
    expect(response.body.failed[0].index).toBe(2);

    // Verify that Alice and Bob were NOT persisted (rollback worked)
    const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
    const allEntities = await manager?.getAllEntities();
    expect(allEntities).toHaveLength(0);
  });

  it("should silently skip duplicate event guids (idempotent re-push)", async () => {
    const currentApp = requireApp();
    const sharedGuid = uuidv4();
    const entityGuid = uuidv4();

    const event: FormSubmission = {
      guid: sharedGuid,
      entityGuid,
      type: "create-individual",
      data: { name: "Alice", age: 25 },
      timestamp: "2024-01-01T00:00:01.000Z",
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    // First push — should succeed
    const response1 = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [event], configId: mockConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response1.status).toBe(200);
    expect(response1.body.applied).toBe(1);

    // Second push with the same event — should succeed (idempotent, duplicate skipped)
    const response2 = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [event], configId: mockConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response2.status).toBe(200);

    // Only one entity should exist (the duplicate was skipped, not duplicated)
    const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
    const allEntities = await manager?.getAllEntities();
    expect(allEntities).toHaveLength(1);
  });
});
