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

/*
 * OpenProject #1145 — sync-push member-GUID injection guard (follow-up to
 * #1134). A bounded field worker whose events pass the envelope scope check
 * on `/api/sync/push` must NOT be able to smuggle an out-of-scope pre-existing
 * entity GUID into a group event's `data.members[]` and thereby overwrite that
 * victim's record or attach it to their group. In-scope members and brand-new
 * members must still apply. An unbounded/admin caller is unrestricted.
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
  id: "member-scope-config",
  artifactId: "member-scope-artifact",
  name: "Member Scope Config",
  description: "Member Scope Config Description",
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

const postgresUrl = getConnectionString("sync_route_member_scope");
const DEVICE_ID = "device-member-scope-1";

describeIfPostgres("Sync route — /push member sub-write scope guard (#1145)", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
  let adminToken = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) throw new Error("Sync server instance is not initialized");
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
    if (!adminToken) {
      const loginRes = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      adminToken = get(loginRes.data, "token") ?? "";
    }
  });

  afterEach(async () => {
    if (!app) return;
    const currentApp = requireApp();
    await currentApp.telemetryStore?.whenIdle();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  test("scoped {areaIds:['A1']}: group event injecting an out-of-scope pre-existing member is rejected; victim untouched", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);
    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))!.edm;

    // Victim lives in area A2 (outside the field worker's A1 scope). Seed via
    // the in-process manager so it bypasses the HTTP scope check.
    const victimGuid = uuidv4();
    await manager.submitForm({
      guid: uuidv4(),
      entityGuid: victimGuid,
      type: "create-individual",
      data: { name: "Victim", gender: "female", date_of_birth: "1990-01-15", area_id: "A2" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "seed",
      syncLevel: SyncLevel.LOCAL,
    });

    // Field worker's own group in area A1 (also seeded in-process, empty).
    const groupGuid = uuidv4();
    await manager.submitForm({
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "create-group",
      data: { name: "Field Worker Household", area_id: "A1", members: [] },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "seed",
      syncLevel: SyncLevel.LOCAL,
    });

    // Push an update-group whose ENVELOPE (the A1 group) passes scope, but
    // whose members[] names the out-of-scope victim with attacker data.
    const evilEvent: FormSubmission = {
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "update-group",
      data: {
        name: "Field Worker Household",
        area_id: "A1",
        members: [{ guid: victimGuid, name: "HACKED", type: "individual" }],
      },
      timestamp: "2023-02-01T00:00:00.000Z",
      userId: "field-worker",
      syncLevel: SyncLevel.LOCAL,
    };

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [evilEvent], configId: scopedConfig.id })
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", DEVICE_ID);

    // The whole (single-event transactional) batch fails — nothing applied.
    expect(response.status).toBe(422);
    expect(response.body.applied).toBe(0);

    // Victim's record must be untouched.
    const victimPair = await manager.getEntity(victimGuid);
    expect(victimPair.modified.data.name).toBe("Victim");
    expect(victimPair.modified.data.gender).toBe("female");
    expect(victimPair.modified.data.date_of_birth).toBe("1990-01-15");

    // Victim must NOT have been attached to the field worker's group.
    const groupPair = await manager.getEntity(groupGuid);
    expect((groupPair.modified as { memberIds: string[] }).memberIds).not.toContain(victimGuid);
  });

  test("scoped {areaIds:['A1']}: group event with an in-scope pre-existing member applies", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);
    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))!.edm;

    // In-scope member (A1) plus the field worker's A1 group.
    const memberGuid = uuidv4();
    await manager.submitForm({
      guid: uuidv4(),
      entityGuid: memberGuid,
      type: "create-individual",
      data: { name: "Alice", gender: "female", area_id: "A1" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "seed",
      syncLevel: SyncLevel.LOCAL,
    });
    const groupGuid = uuidv4();
    await manager.submitForm({
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "create-group",
      data: { name: "Household", area_id: "A1", members: [] },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "seed",
      syncLevel: SyncLevel.LOCAL,
    });

    const updateEvent: FormSubmission = {
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "update-group",
      data: {
        name: "Household",
        area_id: "A1",
        members: [{ guid: memberGuid, name: "Alice", phone: "555-1234", type: "individual" }],
      },
      timestamp: "2023-02-01T00:00:00.000Z",
      userId: "field-worker",
      syncLevel: SyncLevel.LOCAL,
    };

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [updateEvent], configId: scopedConfig.id })
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", DEVICE_ID);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.applied).toBe(1);

    const memberPair = await manager.getEntity(memberGuid);
    expect(memberPair.modified.data.phone).toBe("555-1234");
    expect(memberPair.modified.data.gender).toBe("female");
    const groupPair = await manager.getEntity(groupGuid);
    expect((groupPair.modified as { memberIds: string[] }).memberIds).toContain(memberGuid);
  });

  test("scoped {areaIds:['A1']}: create-group with a brand-new member (unknown GUID) applies", async () => {
    const currentApp = requireApp();
    const scopedConfig: AppConfig = { ...baseConfig, syncScope: { areaIds: ["A1"] } };
    await currentApp.appConfigStore.saveConfig(scopedConfig);
    await currentApp.appInstanceStore.createAppInstance(scopedConfig.id);
    const manager = (await currentApp.appInstanceStore.getAppInstance(scopedConfig.id))!.edm;

    const groupGuid = uuidv4();
    const newMemberGuid = uuidv4();
    const createEvent: FormSubmission = {
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "create-group",
      data: {
        name: "New Household",
        area_id: "A1",
        members: [{ guid: newMemberGuid, name: "Newborn", type: "individual" }],
      },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "field-worker",
      syncLevel: SyncLevel.LOCAL,
    };

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [createEvent], configId: scopedConfig.id })
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Device-Id", DEVICE_ID);

    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(1);

    const groupPair = await manager.getEntity(groupGuid);
    expect((groupPair.modified as { memberIds: string[] }).memberIds).toContain(newMemberGuid);
    const memberPair = await manager.getEntity(newMemberGuid);
    expect(memberPair.modified.data.name).toBe("Newborn");
  });

  test("unbounded tenant: group event naming ANY pre-existing member applies (no member restriction)", async () => {
    const currentApp = requireApp();
    // No syncScope → unbounded/admin. Member writes are unrestricted.
    await currentApp.appConfigStore.saveConfig(baseConfig);
    await currentApp.appInstanceStore.createAppInstance(baseConfig.id);
    const manager = (await currentApp.appInstanceStore.getAppInstance(baseConfig.id))!.edm;

    // A pre-existing entity that carries an area unrelated to any scope.
    const memberGuid = uuidv4();
    await manager.submitForm({
      guid: uuidv4(),
      entityGuid: memberGuid,
      type: "create-individual",
      data: { name: "Bob", area_id: "A2" },
      timestamp: "2023-01-01T00:00:00.000Z",
      userId: "seed",
      syncLevel: SyncLevel.LOCAL,
    });

    const groupGuid = uuidv4();
    const createEvent: FormSubmission = {
      guid: uuidv4(),
      entityGuid: groupGuid,
      type: "create-group",
      data: {
        name: "Household",
        members: [{ guid: memberGuid, name: "Bob", type: "individual" }],
      },
      timestamp: "2023-01-02T00:00:00.000Z",
      userId: "admin",
      syncLevel: SyncLevel.LOCAL,
    };

    const response = await request(currentApp.httpServer)
      .post("/api/sync/push")
      .send({ events: [createEvent], configId: baseConfig.id })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.applied).toBe(1);

    const groupPair = await manager.getEntity(groupGuid);
    expect((groupPair.modified as { memberIds: string[] }).memberIds).toContain(memberGuid);
  });
});
