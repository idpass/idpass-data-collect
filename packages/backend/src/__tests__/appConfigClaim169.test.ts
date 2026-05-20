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
 * Tests for PATCH /api/apps/:id/claim169.
 *
 * The route mirrors PATCH /:id/programs — JSON-body edit of a single field,
 * with public-artifact regeneration so mobile picks up the change on the next
 * tenant-config refresh. Mock store pattern matches phase1-backend-hardening
 * and selfServiceEndpoints test suites.
 */

import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createAppConfigRoutes } from "../routes/appConfigRoutes";
import { AppConfig, AppConfigStore, AppInstanceStore } from "../types";

// Stub publicArtifacts so the test doesn't write JSON/PNG files to disk.
jest.mock("../utils/publicArtifacts", () => ({
  generatePublicArtifacts: jest.fn().mockResolvedValue({ jsonPath: "/tmp/x.json", qrPath: "/tmp/x.png" }),
  getPublicArtifactPaths: jest.fn().mockReturnValue({ jsonPath: "/tmp/x.json", qrPath: "/tmp/x.png" }),
  resolvePublicBaseUrl: jest.fn().mockReturnValue("http://localhost:3000"),
}));

import { generatePublicArtifacts } from "../utils/publicArtifacts";

const JWT_SECRET = "test-secret-claim169-routes-32chars!!";
const ADMIN_TOKEN = jwt.sign({ id: 1, username: "admin", role: "ADMIN" }, JWT_SECRET, {
  expiresIn: "1h",
});

const BASE_CONFIG: AppConfig = {
  id: "tenant-claim169",
  artifactId: "artifact-abc",
  name: "Claim169 Tenant",
  description: "Tenant under test",
};

function buildApp(store: jest.Mocked<AppConfigStore>, instanceStore: jest.Mocked<AppInstanceStore>) {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/apps", createAppConfigRoutes(store, instanceStore));
  return app;
}

function buildMockStores(initial: AppConfig) {
  // The store keeps an in-memory copy that getConfig returns and saveConfig
  // mutates — enough fidelity for the PATCH happy/clear paths.
  let current: AppConfig = { ...initial };

  const appConfigStore: jest.Mocked<AppConfigStore> = {
    initialize: jest.fn(),
    getConfigs: jest.fn().mockResolvedValue([current]),
    getConfig: jest.fn().mockImplementation(async (id: string) => {
      if (id !== current.id) {
        throw new Error(`Configuration with id ${id} not found`);
      }
      return current;
    }),
    getConfigByArtifactId: jest.fn(),
    saveConfig: jest.fn().mockImplementation(async (c: AppConfig) => {
      current = { ...c };
    }),
    archiveConfig: jest.fn(),
    restoreConfig: jest.fn(),
    deleteConfig: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppConfigStore>;

  const appInstanceStore: jest.Mocked<AppInstanceStore> = {
    initialize: jest.fn(),
    createAppInstance: jest.fn(),
    updateAppInstance: jest.fn().mockResolvedValue(undefined),
    loadEntityData: jest.fn(),
    getAppInstance: jest.fn().mockResolvedValue(null),
    clearAppInstance: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppInstanceStore>;

  return { appConfigStore, appInstanceStore, getCurrent: () => current };
}

describe("PATCH /api/apps/:id/claim169", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    (generatePublicArtifacts as jest.Mock).mockClear();
  });

  it("persists the claim169 block and regenerates the public artifact", async () => {
    const { appConfigStore, appInstanceStore, getCurrent } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const claim169 = {
      enabled: true,
      trustedIssuers: [
        {
          issuerId: "did:web:issuer.example",
          publicKey: { ed25519: "z6Mk...abc" },
        },
      ],
    };

    const patchRes = await request(app)
      .patch(`/api/apps/${BASE_CONFIG.id}/claim169`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ claim169 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("success");
    expect(patchRes.body.claim169).toEqual(claim169);

    expect(appConfigStore.saveConfig).toHaveBeenCalledTimes(1);
    expect(appInstanceStore.updateAppInstance).toHaveBeenCalledWith(BASE_CONFIG.id);
    expect(generatePublicArtifacts).toHaveBeenCalledTimes(1);
    expect(getCurrent().claim169).toEqual(claim169);

    // GET /:id should now return the same block back
    const getRes = await request(app)
      .get(`/api/apps/${BASE_CONFIG.id}`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.claim169).toEqual(claim169);
  });

  it("clears the claim169 block when body.claim169 is null", async () => {
    const seeded: AppConfig = {
      ...BASE_CONFIG,
      claim169: {
        enabled: true,
        trustedIssuers: [{ issuerId: "did:web:old", publicKey: { ed25519: "old" } }],
      },
    };
    const { appConfigStore, appInstanceStore, getCurrent } = buildMockStores(seeded);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${seeded.id}/claim169`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ claim169: null });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("success");
    expect(patchRes.body.claim169).toBeNull();
    expect(getCurrent().claim169).toBeNull();
    expect(generatePublicArtifacts).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid claim169 body with 400", async () => {
    const { appConfigStore, appInstanceStore } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${BASE_CONFIG.id}/claim169`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ claim169: { enabled: "yes" } });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toBe("Invalid claim169 payload");
    expect(appConfigStore.saveConfig).not.toHaveBeenCalled();
    expect(generatePublicArtifacts).not.toHaveBeenCalled();
  });

  it("returns 404-ish error when the tenant id is unknown", async () => {
    const { appConfigStore, appInstanceStore } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch("/api/apps/does-not-exist/claim169")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({
        claim169: {
          enabled: false,
          trustedIssuers: [],
        },
      });

    // The configured AppConfigStore throws "not found"; the global error
    // handler maps that to a 500 unless an AppError(404) was thrown. The
    // route currently lets the store error propagate, so any 4xx/5xx is
    // acceptable as long as nothing was persisted and the artifact was not
    // regenerated.
    expect(patchRes.status).toBeGreaterThanOrEqual(400);
    expect(appConfigStore.saveConfig).not.toHaveBeenCalled();
    expect(generatePublicArtifacts).not.toHaveBeenCalled();
  });
});
