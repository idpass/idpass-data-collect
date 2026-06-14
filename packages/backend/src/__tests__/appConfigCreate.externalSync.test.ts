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

/**
 * Tests for POST /api/apps — atomicity / error semantics around external-sync.
 *
 * Regression for the "500 on save, but the program is there on refresh" bug:
 * the handler persisted the config (`saveConfig`) and only THEN ran
 * `createAppInstance`, whose `ExternalSyncManager.initialize()` throws when the
 * adapter config is invalid (e.g. the `mock` adapter without clientId/
 * clientSecret). The write had already committed, so the client got a 500 for
 * a config that exists.
 *
 * Desired behaviour:
 *  - Part A (validate-first): an invalid external-sync adapter config is
 *    rejected with 400 BEFORE persisting — nothing is saved.
 *  - Part B (decouple): a valid config whose post-persist side effects fail
 *    (instance/adapter init, artifact generation) still returns success with a
 *    `warnings` array — never a 500 for a committed write.
 */

import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { adapterRegistry } from "@idpass/data-collect-core";
import { MockRegistrySyncAdapter } from "@idpass/adapter-mock";
import { createAppConfigRoutes } from "../routes/appConfigRoutes";
import { errorHandler } from "../middlewares/errorHandlers";
import { AppConfig, AppConfigStore, AppInstanceStore } from "../types";

// Register the `mock` V2 adapter exactly as syncServer.ts does, so
// validateExternalSyncConfig finds its schema (clientId/clientSecret required).
adapterRegistry.register("mock", (deps) =>
  new MockRegistrySyncAdapter(deps!.eventStore, deps!.eventApplierService),
);

jest.mock("../utils/publicArtifacts", () => ({
  generatePublicArtifacts: jest.fn().mockResolvedValue({ jsonPath: "/tmp/x.json", qrPath: "/tmp/x.png" }),
  getPublicArtifactPaths: jest.fn().mockReturnValue({ jsonPath: "/tmp/x.json", qrPath: "/tmp/x.png" }),
  resolvePublicBaseUrl: jest.fn().mockReturnValue("http://localhost:3000"),
}));

const JWT_SECRET = "test-secret-appconfig-create-32chars!!";
const ADMIN_TOKEN = jwt.sign({ id: 1, username: "admin", role: "ADMIN" }, JWT_SECRET, {
  expiresIn: "1h",
});

function buildApp(store: jest.Mocked<AppConfigStore>, instanceStore: jest.Mocked<AppInstanceStore>) {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/apps", createAppConfigRoutes(store, instanceStore));
  app.use(errorHandler);
  return app;
}

function buildMockStores() {
  const saved: AppConfig[] = [];
  const appConfigStore: jest.Mocked<AppConfigStore> = {
    initialize: jest.fn(),
    getConfigs: jest.fn().mockResolvedValue(saved),
    getConfig: jest.fn().mockImplementation(async (id: string) => {
      const found = saved.find((c) => c.id === id);
      if (!found) throw new Error(`Configuration with id ${id} not found`);
      return found;
    }),
    getConfigByArtifactId: jest.fn(),
    saveConfig: jest.fn().mockImplementation(async (c: AppConfig) => {
      saved.push({ ...c });
    }),
    archiveConfig: jest.fn(),
    restoreConfig: jest.fn(),
    deleteConfig: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppConfigStore>;

  const appInstanceStore: jest.Mocked<AppInstanceStore> = {
    initialize: jest.fn(),
    createAppInstance: jest.fn().mockResolvedValue(undefined),
    updateAppInstance: jest.fn().mockResolvedValue(undefined),
    loadEntityData: jest.fn().mockResolvedValue(undefined),
    getAppInstance: jest.fn().mockResolvedValue(null),
    clearAppInstance: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppInstanceStore>;

  return { appConfigStore, appInstanceStore, saved };
}

function postConfig(app: express.Express, config: object) {
  return request(app)
    .post("/api/apps")
    .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
    .attach("config", Buffer.from(JSON.stringify(config)), "config.json");
}

describe("POST /api/apps — external-sync error semantics", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it("Part A: rejects an invalid external-sync adapter config with 400 and does NOT persist", async () => {
    const { appConfigStore, appInstanceStore, saved } = buildMockStores();
    const app = buildApp(appConfigStore, appInstanceStore);

    // `mock` adapter requires clientId + clientSecret (both absent here).
    const res = await postConfig(app, {
      id: "tenant-bad-sync",
      name: "Bad Sync Tenant",
      externalSync: { type: "mock", url: "http://localhost:9999" },
    });

    expect(res.status).toBe(400);
    expect(appConfigStore.saveConfig).not.toHaveBeenCalled();
    expect(appInstanceStore.createAppInstance).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it("Part B: when a post-persist step fails, returns success + warning (config stays saved)", async () => {
    const { appConfigStore, appInstanceStore, saved } = buildMockStores();
    // Simulate a runtime init failure AFTER the config is persisted (e.g. an
    // OpenSPP auth/network blip during adapter init).
    appInstanceStore.createAppInstance.mockRejectedValueOnce(new Error("ECONNREFUSED upstream"));
    const app = buildApp(appConfigStore, appInstanceStore);

    const res = await postConfig(app, {
      id: "tenant-flaky-init",
      name: "Flaky Init Tenant",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(appConfigStore.saveConfig).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
  });

  it("happy path: valid config with no external sync persists and starts the instance", async () => {
    const { appConfigStore, appInstanceStore, saved } = buildMockStores();
    const app = buildApp(appConfigStore, appInstanceStore);

    const res = await postConfig(app, { id: "tenant-ok", name: "OK Tenant" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.warnings ?? []).toHaveLength(0);
    expect(appConfigStore.saveConfig).toHaveBeenCalledTimes(1);
    expect(appInstanceStore.createAppInstance).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
  });
});
