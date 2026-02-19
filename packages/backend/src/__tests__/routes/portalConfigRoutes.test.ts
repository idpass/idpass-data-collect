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

import express from "express";
import request from "supertest";
import { createPortalConfigRoutes } from "../../routes/portalConfigRoutes";
import { PortalConfig, PortalFormConfig } from "../../types/portal";

// Mock pg Pool so health checks don't need a real database
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
  end: jest.fn().mockResolvedValue(undefined),
};
jest.mock("pg", () => {
  return { Pool: jest.fn(() => mockPool) };
});

const sampleConfig: PortalConfig = {
  enabled: true,
  keycloakIssuer: "https://keycloak.example.com/realms/datacollect",
  keycloakClientId: "datacollect-portal",
  opensppUrl: "https://openspp.example.com",
  opensppClientId: "portal-service",
  opensppClientSecret: "secret",
  identifierNamespace: "urn:openspp:registrant",
  draftTtlDays: 30,
};

const NOW = new Date("2024-06-01T12:00:00.000Z");

function makeFormConfig(changeRequestType: string): PortalFormConfig {
  return {
    id: 1,
    appConfigId: sampleConfig.identifierNamespace,
    changeRequestType,
    formioSchema: { components: [] },
    sourceJsonSchemaHash: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildMockFormConfigStore(configs: PortalFormConfig[] = []) {
  return {
    findAll: jest.fn().mockResolvedValue(configs),
  };
}

function buildApp(
  config: PortalConfig = sampleConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formConfigStore?: any,
) {
  const app = express();
  app.use(express.json());
  app.use("/api/portal", createPortalConfigRoutes(config, pool ?? mockPool, formConfigStore));
  return app;
}

describe("GET /api/portal/config", () => {
  it("returns 200 with the expected shape", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      keycloak: expect.any(Object),
      branding: expect.any(Object),
      consentText: expect.any(String),
      requestTypes: expect.any(Array),
    });
  });

  it("returns the correct Keycloak issuer from config", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.keycloak.issuer).toBe(sampleConfig.keycloakIssuer);
  });

  it("returns the correct Keycloak clientId from config", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.keycloak.clientId).toBe(sampleConfig.keycloakClientId);
  });

  it("includes the openid scopes", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.keycloak.scopes).toBe("openid profile email");
  });

  it("returns branding name", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.branding.name).toBe("DataCollect Portal");
  });

  it("returns a non-empty consentText", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.consentText.length).toBeGreaterThan(0);
  });

  it("returns an empty requestTypes array when no form config store is provided", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.body.requestTypes).toEqual([]);
  });

  it("returns requestTypes populated from portalFormConfigStore.findAll when store is provided", async () => {
    const formConfigs = [makeFormConfig("address-change"), makeFormConfig("name-change")];
    const store = buildMockFormConfigStore(formConfigs);
    const app = buildApp(sampleConfig, mockPool, store);

    const response = await request(app).get("/api/portal/config");

    expect(response.status).toBe(200);
    expect(response.body.requestTypes).toHaveLength(2);
    expect(response.body.requestTypes).toContain("address-change");
    expect(response.body.requestTypes).toContain("name-change");
  });

  it("returns an empty requestTypes array when store.findAll returns no configs", async () => {
    const store = buildMockFormConfigStore([]);
    const app = buildApp(sampleConfig, mockPool, store);

    const response = await request(app).get("/api/portal/config");

    expect(response.body.requestTypes).toEqual([]);
  });

  it("sets Cache-Control header with public max-age=300", async () => {
    const app = buildApp();

    const response = await request(app).get("/api/portal/config");

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("reflects a different keycloakIssuer when config changes", async () => {
    const customConfig = {
      ...sampleConfig,
      keycloakIssuer: "https://other-keycloak.org/realms/test",
      keycloakClientId: "other-client",
    };
    const app = buildApp(customConfig);

    const response = await request(app).get("/api/portal/config");

    expect(response.body.keycloak.issuer).toBe("https://other-keycloak.org/realms/test");
    expect(response.body.keycloak.clientId).toBe("other-client");
  });
});

describe("GET /api/portal/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock pool to a healthy state before each test
    mockPool.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  });

  it("returns 200 with healthy status when database and keycloak are reachable", async () => {
    // Mock global fetch for Keycloak discovery endpoint
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const app = buildApp();

    const response = await request(app).get("/api/portal/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("healthy");
    expect(response.body.checks.database).toBe("ok");
    expect(response.body.checks.keycloak).toBe("ok");
  });

  it("returns 503 with degraded status when database query fails", async () => {
    mockPool.query.mockRejectedValue(new Error("Connection refused"));

    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

    const app = buildApp();

    const response = await request(app).get("/api/portal/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.checks.database).toBe("error");
  });

  it("returns 503 with degraded status when Keycloak is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const app = buildApp();

    const response = await request(app).get("/api/portal/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.checks.keycloak).toBe("unreachable");
  });

  it("returns 503 when Keycloak responds with non-ok status", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as Response);

    const app = buildApp();

    const response = await request(app).get("/api/portal/health");

    expect(response.status).toBe(503);
    expect(response.body.checks.keycloak).toBe("error");
  });

  it("uses the provided pool instance instead of creating a new one", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const constructorCallsBefore = Pool.mock.calls.length;

    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

    const app = buildApp();
    await request(app).get("/api/portal/health");

    // No new Pool instances should have been created by the health handler
    expect(Pool.mock.calls.length).toBe(constructorCallsBefore);
  });

  it("response always includes checks object", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

    const app = buildApp();

    const response = await request(app).get("/api/portal/health");

    expect(response.body).toHaveProperty("checks");
    expect(typeof response.body.checks).toBe("object");
  });
});
