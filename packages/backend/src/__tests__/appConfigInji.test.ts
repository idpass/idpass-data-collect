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
 * Tests for PATCH /api/apps/:id/inji.
 *
 * Mirrors PATCH /:id/claim169 — JSON-body edit of a single field with
 * public-artifact regeneration so mobile picks up the change on the next
 * tenant-config refresh.
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

const JWT_SECRET = "test-secret-inji-routes-32chars!!!!!";
const ADMIN_TOKEN = jwt.sign({ id: 1, username: "admin", role: "ADMIN" }, JWT_SECRET, {
  expiresIn: "1h",
});

const BASE_CONFIG: AppConfig = {
  id: "tenant-inji",
  artifactId: "artifact-inji",
  name: "Inji Tenant",
  description: "Tenant under test",
};

const SAMPLE_INJI = {
  enabled: true,
  trustedIssuers: [
    {
      issuerId: "did:web:issuer.example",
      kid: "key-1",
      publicKey: { es256: "MFkw...spki" },
    },
  ],
  credentialTemplates: [
    {
      id: "birth-cert-v1",
      matchTypes: ["VerifiableCredential", "BirthCertificate"],
      expectedFormat: "jwt-vc" as const,
      allowedIssuers: ["did:web:issuer.example"],
      claimLabel: "Birth Certificate",
    },
  ],
};

function buildApp(store: jest.Mocked<AppConfigStore>, instanceStore: jest.Mocked<AppInstanceStore>) {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/apps", createAppConfigRoutes(store, instanceStore));
  return app;
}

function buildMockStores(initial: AppConfig) {
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

describe("PATCH /api/apps/:id/inji", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    (generatePublicArtifacts as jest.Mock).mockClear();
  });

  it("persists the inji block and regenerates the public artifact", async () => {
    const { appConfigStore, appInstanceStore, getCurrent } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${BASE_CONFIG.id}/inji`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ inji: SAMPLE_INJI });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("success");
    expect(patchRes.body.inji).toEqual(SAMPLE_INJI);

    expect(appConfigStore.saveConfig).toHaveBeenCalledTimes(1);
    expect(appInstanceStore.updateAppInstance).toHaveBeenCalledWith(BASE_CONFIG.id);
    expect(generatePublicArtifacts).toHaveBeenCalledTimes(1);
    expect(getCurrent().inji).toEqual(SAMPLE_INJI);

    const getRes = await request(app)
      .get(`/api/apps/${BASE_CONFIG.id}`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.inji).toEqual(SAMPLE_INJI);
  });

  it("omits absent optional fields from the persisted shape", async () => {
    const { appConfigStore, appInstanceStore, getCurrent } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${BASE_CONFIG.id}/inji`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({
        inji: {
          enabled: true,
          trustedIssuers: [{ issuerId: "did:web:a", publicKey: { ed25519: "z6Mk..." } }],
          credentialTemplates: [
            { id: "t1", matchTypes: ["VerifiableCredential"], expectedFormat: "sd-jwt" },
          ],
        },
      });

    expect(patchRes.status).toBe(200);
    const saved = getCurrent().inji!;
    expect(saved.trustedIssuers[0]).not.toHaveProperty("kid");
    expect(saved.trustedIssuers[0].publicKey).not.toHaveProperty("es256");
    expect(saved.credentialTemplates[0]).not.toHaveProperty("allowedIssuers");
    expect(saved.credentialTemplates[0]).not.toHaveProperty("claimLabel");
  });

  it("clears the inji block when body.inji is null", async () => {
    const seeded: AppConfig = { ...BASE_CONFIG, inji: SAMPLE_INJI };
    const { appConfigStore, appInstanceStore, getCurrent } = buildMockStores(seeded);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${seeded.id}/inji`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ inji: null });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("success");
    expect(patchRes.body.inji).toBeNull();
    expect(getCurrent().inji).toBeNull();
    expect(generatePublicArtifacts).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid inji body with 400", async () => {
    const { appConfigStore, appInstanceStore } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch(`/api/apps/${BASE_CONFIG.id}/inji`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ inji: { enabled: true, trustedIssuers: [], credentialTemplates: [{ id: "t1", matchTypes: [], expectedFormat: "json-ld" }] } });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toBe("Invalid inji payload");
    expect(appConfigStore.saveConfig).not.toHaveBeenCalled();
    expect(generatePublicArtifacts).not.toHaveBeenCalled();
  });

  it("returns an error when the tenant id is unknown", async () => {
    const { appConfigStore, appInstanceStore } = buildMockStores(BASE_CONFIG);
    const app = buildApp(appConfigStore, appInstanceStore);

    const patchRes = await request(app)
      .patch("/api/apps/does-not-exist/inji")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ inji: { enabled: false, trustedIssuers: [], credentialTemplates: [] } });

    expect(patchRes.status).toBeGreaterThanOrEqual(400);
    expect(appConfigStore.saveConfig).not.toHaveBeenCalled();
    expect(generatePublicArtifacts).not.toHaveBeenCalled();
  });
});
