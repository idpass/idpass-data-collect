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

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createSelfServiceRouter } from "../routes/selfServiceRoutes";
import { createAppConfigRoutes } from "../routes/appConfigRoutes";
import { OtpStoreImpl } from "../stores/OtpStore";
import { AppInstanceStore, AppConfigStore, AppConfig } from "../types";
import { errorHandler } from "../middlewares/errorHandlers";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

const JWT_SECRET = "test-secret-for-endpoints";

const postgresUrl = getConnectionString("self_svc_endpoints");

// ─── Test data ───

const TEST_TENANT_CONFIG: AppConfig = {
  id: "test-tenant",
  name: "Test Tenant",
  description: "A test tenant for endpoint tests",
  entityForms: [
    {
      id: "form-update-profile",
      name: "update-individual",
      title: "Update Profile",
      formio: { components: [{ type: "textfield", key: "name", label: "Full Name" }] },
    },
    {
      id: "form-change-address",
      name: "change-address",
      title: "Change Address",
      formio: { components: [{ type: "textfield", key: "address", label: "Address" }] },
    },
  ],
  selfService: {
    enabled: true,
    authMethods: ["otp", "id"],
    allowedForms: ["update-individual", "change-address"],
    languages: ["en", "fr"],
    requireReview: false,
  },
};

const TEST_ENTITY = {
  modified: {
    guid: "entity-guid-1",
    type: "individual",
    data: { name: "Test Person", dateOfBirth: "1990-01-15" },
    lastUpdated: "2026-01-01T00:00:00Z",
    identifiers: [],
  },
};

// ─── Token helpers ───

function createValidToken(): string {
  return jwt.sign(
    { scope: "self-service", identifier: "test-entity-1", entityGuid: "entity-guid-1", tenantId: "test-tenant" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function createNoEntityToken(): string {
  return jwt.sign({ scope: "self-service", identifier: "test-user", tenantId: "test-tenant" }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

function createWrongScopeToken(): string {
  return jwt.sign(
    { scope: "admin", identifier: "test-user", entityGuid: "entity-guid-1", tenantId: "test-tenant" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// ─── Mock factories ───

function createMockAppConfigStore(configs: AppConfig[] = [TEST_TENANT_CONFIG]): jest.Mocked<AppConfigStore> {
  return {
    initialize: jest.fn(),
    getConfigs: jest.fn().mockResolvedValue(configs),
    getConfig: jest.fn().mockImplementation(async (id: string) => {
      const config = configs.find((c) => c.id === id);
      if (!config) {
        throw new Error(`Config with id ${id} not found`);
      }
      return config;
    }),
    getConfigByArtifactId: jest.fn(),
    saveConfig: jest.fn(),
    deleteConfig: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppConfigStore>;
}

function createMockAppInstanceStore(): jest.Mocked<AppInstanceStore> {
  return {
    initialize: jest.fn(),
    createAppInstance: jest.fn(),
    updateAppInstance: jest.fn(),
    loadEntityData: jest.fn(),
    getAppInstance: jest.fn().mockResolvedValue({
      configId: "test-tenant",
      config: TEST_TENANT_CONFIG,
      edm: {
        getEntity: jest.fn().mockResolvedValue(TEST_ENTITY),
        getAllEntities: jest.fn().mockResolvedValue([TEST_ENTITY]),
        searchEntities: jest.fn().mockResolvedValue([]),
        getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
        submitForm: jest.fn().mockResolvedValue(undefined),
      } as never,
    }),
    clearAppInstance: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<AppInstanceStore>;
}

// ─── 1. GET /api/apps/:id/public ───

describe("GET /api/apps/:id/public", () => {
  let app: express.Express;
  let mockAppConfigStore: jest.Mocked<AppConfigStore>;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppConfigStore = createMockAppConfigStore();
    mockAppInstanceStore = createMockAppInstanceStore();

    app = express();
    app.use(bodyParser.json());
    app.use("/api/apps", createAppConfigRoutes(mockAppConfigStore, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should return only public fields (no credentials or entity data)", async () => {
    const response = await request(app).get("/api/apps/test-tenant/public");

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Test Tenant");
    expect(response.body.description).toBe("A test tenant for endpoint tests");

    // Public config should NOT include sensitive fields
    expect(response.body.entityForms).toBeUndefined();
    expect(response.body.entityData).toBeUndefined();
    expect(response.body.externalSync).toBeUndefined();
    expect(response.body.id).toBeUndefined();
    expect(response.body.artifactId).toBeUndefined();
  });

  it("should return 404 for non-existent config", async () => {
    const response = await request(app).get("/api/apps/nonexistent-tenant/public");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Configuration not found");
  });

  it("should include selfService.languages when configured", async () => {
    const response = await request(app).get("/api/apps/test-tenant/public");

    expect(response.status).toBe(200);
    expect(response.body.selfService).toBeDefined();
    expect(response.body.selfService.languages).toEqual(["en", "fr"]);
    expect(response.body.selfService.enabled).toBe(true);
    expect(response.body.selfService.authMethods).toEqual(["otp", "id"]);
  });

  it("should not include selfService section when not configured", async () => {
    const configWithoutSelfService: AppConfig = {
      id: "plain-tenant",
      name: "Plain Tenant",
    };
    mockAppConfigStore.getConfig.mockImplementation(async (id: string) => {
      if (id === "plain-tenant") return configWithoutSelfService;
      throw new Error(`Config with id ${id} not found`);
    });

    const response = await request(app).get("/api/apps/plain-tenant/public");

    expect(response.status).toBe(200);
    expect(response.body.selfService).toBeUndefined();
  });

  it("should include authConfig types but not fields", async () => {
    const configWithAuth: AppConfig = {
      id: "auth-tenant",
      name: "Auth Tenant",
      authConfigs: [
        { type: "basic", fields: { username: "admin", password: "secret" } },
        { type: "token", fields: { apiKey: "super-secret-key" } },
      ],
    };
    mockAppConfigStore.getConfig.mockImplementation(async (id: string) => {
      if (id === "auth-tenant") return configWithAuth;
      throw new Error(`Config with id ${id} not found`);
    });

    const response = await request(app).get("/api/apps/auth-tenant/public");

    expect(response.status).toBe(200);
    expect(response.body.authConfigs).toEqual([{ type: "basic" }, { type: "token" }]);
    // Credentials should NOT be exposed
    expect(response.body.authConfigs[0].fields).toBeUndefined();
    expect(response.body.authConfigs[1].fields).toBeUndefined();
  });
});

// ─── 2. POST /api/auth/oidc/exchange ───

describeIfPostgres("POST /api/auth/oidc/exchange", () => {
  let app: express.Express;
  let otpStore: OtpStoreImpl;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await ensureDatabaseExists(postgresUrl);
  });

  beforeEach(async () => {
    otpStore = new OtpStoreImpl(postgresUrl);
    await otpStore.initialize();
    await otpStore.clearStore();

    mockAppInstanceStore = createMockAppInstanceStore();

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(otpStore, mockAppInstanceStore));
    app.use(errorHandler);
  });

  afterEach(async () => {
    await otpStore.clearStore();
    await otpStore.closeConnection();
  });

  it("should reject when request body is invalid (missing fields)", async () => {
    const response = await request(app).post("/api/auth/oidc/exchange").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(response.body.details).toBeDefined();
  });

  it("should reject when idToken is missing", async () => {
    const response = await request(app).post("/api/auth/oidc/exchange").send({
      accessToken: "fake-access-token",
      tenantId: "test-tenant",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it("should reject when accessToken is missing", async () => {
    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "fake.token.value",
      tenantId: "test-tenant",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it("should return uniform 'Authentication failed' when tenant is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "fake.token.value",
      accessToken: "fake-access-token",
      tenantId: "nonexistent-tenant",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication failed");
    // Should NOT leak tenant-specific information
    expect(response.body.error).not.toContain("Tenant not found");
  });

  it("should return 400 for invalid token format (not 3 parts)", async () => {
    // Set up a tenant with OIDC config so we reach the token parsing logic
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "test-tenant",
      config: {
        ...TEST_TENANT_CONFIG,
        selfService: {
          ...TEST_TENANT_CONFIG.selfService!,
          oidcConfig: {
            authority: "https://esignet.example.com",
            clientId: "test-client",
            redirectUri: "https://app.example.com/callback",
            scope: "openid profile",
            entityMapping: {
              primaryClaim: "sub",
              entityField: "nationalId",
            },
          },
        },
      } as AppConfig,
      edm: {} as never,
    });

    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "not-a-valid-jwt",
      accessToken: "fake-access-token",
      tenantId: "test-tenant",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid ID token format");
  });

  it("should return 400 when OIDC is not configured for the tenant", async () => {
    // Tenant without OIDC config
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "test-tenant",
      config: {
        id: "test-tenant",
        name: "Test Tenant",
        selfService: {
          enabled: true,
          authMethods: ["otp"],
          allowedForms: [],
          languages: ["en"],
          requireReview: false,
        },
      } as AppConfig,
      edm: {} as never,
    });

    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "header.payload.signature",
      accessToken: "fake-access-token",
      tenantId: "test-tenant",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("OIDC not configured for this tenant");
  });
});

// ─── 2b. POST /api/auth/oidc/exchange (pre-verification, without PostgreSQL) ───

const OIDC_TENANT_ID = "oidc-tenant";
const OIDC_TENANT_CONFIG: AppConfig = {
  id: OIDC_TENANT_ID,
  name: "OIDC Tenant",
  entityForms: [],
  selfService: {
    enabled: true,
    allowedForms: ["update-individual"],
    authMethods: ["oidc"],
    languages: ["en"],
    requireReview: false,
    oidcConfig: {
      authority: "https://esignet.example.org",
      clientId: "test-client",
      redirectUri: "http://localhost/callback",
      scope: "openid profile",
      entityMapping: {
        primaryClaim: "sub",
        entityField: "oidcSubject",
      },
    },
  },
};

describe("POST /api/auth/oidc/exchange (pre-verification, without PostgreSQL)", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppInstanceStore = createMockAppInstanceStore();
    mockAppInstanceStore.getAppInstance.mockImplementation(async (configId?: string) => {
      if (configId === OIDC_TENANT_ID) {
        return {
          configId: OIDC_TENANT_ID,
          config: OIDC_TENANT_CONFIG,
          edm: {
            getEntity: jest.fn(),
            getAllEntities: jest.fn().mockResolvedValue([]),
            searchEntities: jest.fn().mockResolvedValue([]),
            getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
            submitForm: jest.fn(),
          } as never,
        };
      }
      return null;
    });

    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should reject token without issuer claim", async () => {
    const fakePayload = Buffer.from(JSON.stringify({ sub: "test" })).toString("base64url");
    const fakeToken = `eyJhbGciOiJSUzI1NiJ9.${fakePayload}.fakesig`;

    const response = await request(app)
      .post("/api/auth/oidc/exchange")
      .send({ idToken: fakeToken, accessToken: "test", tenantId: OIDC_TENANT_ID });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("missing issuer");
  });

  it("should reject token with wrong issuer", async () => {
    const fakePayload = Buffer.from(JSON.stringify({ iss: "https://evil.example.com", sub: "test" })).toString(
      "base64url",
    );
    const fakeToken = `eyJhbGciOiJSUzI1NiJ9.${fakePayload}.fakesig`;

    const response = await request(app)
      .post("/api/auth/oidc/exchange")
      .send({ idToken: fakeToken, accessToken: "test", tenantId: OIDC_TENANT_ID });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain("issuer does not match");
  });
});

// ─── 3. GET /api/auth/self-service/entity ───

describe("GET /api/auth/self-service/entity (without PostgreSQL)", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppInstanceStore = createMockAppInstanceStore();

    // Create a minimal mock OtpStore to satisfy the router constructor
    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should return 401 without auth token", async () => {
    const response = await request(app).get("/api/auth/self-service/entity");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should return 400 when token has no entityGuid", async () => {
    const token = createNoEntityToken();

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("No entity associated with this token");
  });

  it("should return 400 for OTP token without entityGuid at handler level", async () => {
    const otpToken = jwt.sign(
      { scope: "self-service", identifier: "phone:+1234567890", tenantId: "test-tenant" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .get("/api/auth/self-service/entity")
      .set("Authorization", `Bearer ${otpToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("No entity associated");
  });

  it("should return entity data and availableForms with formio schemas", async () => {
    const token = createValidToken();

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    // Entity data
    expect(response.body.entity).toBeDefined();
    expect(response.body.entity.guid).toBe("entity-guid-1");
    expect(response.body.entity.data.name).toBe("Test Person");
    expect(response.body.entity.lastUpdated).toBe("2026-01-01T00:00:00Z");

    // Available forms with formio schemas
    expect(response.body.availableForms).toHaveLength(2);

    const updateForm = response.body.availableForms.find((f: { type: string }) => f.type === "update-individual");
    expect(updateForm).toBeDefined();
    expect(updateForm.label).toBe("Update Profile");
    expect(updateForm.formio).toBeDefined();
    expect(updateForm.formio.components).toBeDefined();

    const addressForm = response.body.availableForms.find((f: { type: string }) => f.type === "change-address");
    expect(addressForm).toBeDefined();
    expect(addressForm.label).toBe("Change Address");
    expect(addressForm.formio).toBeDefined();
  });

  it("should return 404 when tenant is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);
    const token = createValidToken();

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Tenant not found");
  });

  it("should return 404 when entity is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "test-tenant",
      config: TEST_TENANT_CONFIG,
      edm: {
        getEntity: jest.fn().mockRejectedValue(new Error("Entity not found")),
        getAllEntities: jest.fn().mockResolvedValue([]),
        getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
      } as never,
    });
    const token = createValidToken();

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Entity not found");
  });
});

// ─── 4. POST /api/auth/self-service/submit ───

describe("POST /api/auth/self-service/submit (without PostgreSQL)", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppInstanceStore = createMockAppInstanceStore();

    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should return 401 without auth token", async () => {
    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .send({
        formType: "update-individual",
        formData: { name: "Updated Name" },
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should return 400 when token has no entityGuid", async () => {
    const token = createNoEntityToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "update-individual", formData: { name: "Updated" } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("No entity associated with this token");
  });

  it("should reject missing formType", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formData: { name: "Updated" } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(response.body.details).toBeDefined();
  });

  it("should reject missing formData", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "update-individual" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it("should reject empty request body", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it("should successfully submit a form and return success status", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "update-individual", formData: { name: "Updated Name" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.submissionGuid).toBeDefined();
  });

  it("should reject formType not in allowedForms with 403", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "delete-entity", formData: { name: "test" } });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("not allowed");
  });

  it("should return 404 when tenant is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "update-individual", formData: { name: "Updated" } });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Tenant not found");
  });
});

// ─── 4b. Entity form name routing (config-driven topology) ───

/**
 * Tests that entity form detection in the submit handler uses the config's
 * dependsOn topology rather than a hardcoded list of form names.
 *
 * A form is an "entity form" (produces update-<name> events) if:
 * - It has a dependsOn field (it's a sub-entity of another form), OR
 * - Other forms reference it via dependsOn (it's a top-level entity type)
 *
 * Forms that satisfy neither condition are "standalone" (e.g., grievance,
 * life_event) and are stored as review records without modifying entities.
 */
describe("POST /api/auth/self-service/submit — entity form name routing", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;
  let mockSubmitForm: jest.Mock;

  // Config with dependsOn topology:
  // - "household" is top-level (no dependsOn), but "individual" depends on it → Group entity
  // - "individual" has dependsOn: "household" and is a dependsOn target → Individual entity
  // - "association" is top-level (no dependsOn), and "member" depends on it → Group entity
  // - "member" has dependsOn: "association", not a target → Record
  // - "grievance" has dependsOn: "individual", not a target → Record
  // - "life_event" has dependsOn: "individual", not a target → Record
  const TOPOLOGY_CONFIG: AppConfig = {
    id: "topology-tenant",
    name: "Topology Test Tenant",
    entityForms: [
      { id: "f-household", name: "household", title: "Household" },
      { id: "f-individual", name: "individual", title: "Individual", dependsOn: "household" },
      { id: "f-association", name: "association", title: "Association" },
      { id: "f-member", name: "member", title: "Member", dependsOn: "association" },
      { id: "f-grievance", name: "grievance", title: "Grievance", dependsOn: "individual" },
      { id: "f-life-event", name: "life_event", title: "Life Event", dependsOn: "individual" },
    ],
    selfService: {
      enabled: true,
      authMethods: ["otp"],
      allowedForms: ["household", "individual", "association", "member", "grievance", "life_event"],
      languages: ["en"],
      requireReview: false,
    },
  };

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockSubmitForm = jest.fn().mockResolvedValue(undefined);

    mockAppInstanceStore = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn().mockResolvedValue({
        configId: "topology-tenant",
        config: TOPOLOGY_CONFIG,
        edm: {
          getEntity: jest.fn().mockResolvedValue(TEST_ENTITY),
          getAllEntities: jest.fn().mockResolvedValue([TEST_ENTITY]),
          searchEntities: jest.fn().mockResolvedValue([]),
          getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
          submitForm: mockSubmitForm,
        } as never,
      }),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;

    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should route 'household' (top-level group) as entity update with update-group", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "household", formData: { address: "123 Main St" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    // Top-level entity forms produce update-group via FormClassifier
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    expect(mockSubmitForm.mock.calls[0][0].type).toBe("update-group");
  });

  it("should route 'individual' (has dependsOn) as entity update", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "individual", formData: { name: "Jane Doe" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    expect(mockSubmitForm.mock.calls[0][0].type).toBe("update-individual");
  });

  it("should route 'association' (top-level group) as entity update with update-group", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "association", formData: { name: "Village Council" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    // Top-level entity forms produce update-group via FormClassifier
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    expect(mockSubmitForm.mock.calls[0][0].type).toBe("update-group");
  });

  it("should route 'grievance' (record, dependsOn individual, not a target) as record form", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "grievance", formData: { description: "Water shortage" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    // Record forms do NOT call submitForm (they go to review or are just logged)
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });

  it("should route 'life_event' (record, dependsOn individual) as record form", async () => {
    const token = createValidToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "life_event", formData: { event: "birth" } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    // Record forms do NOT call submitForm
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });
});

// ─── 5. GET /api/auth/self-service/submissions ───

describe("GET /api/auth/self-service/submissions (without PostgreSQL)", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppInstanceStore = createMockAppInstanceStore();

    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should return 401 without auth token", async () => {
    const response = await request(app).get("/api/auth/self-service/submissions");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should return 400 when token has no entityGuid", async () => {
    const token = createNoEntityToken();

    const response = await request(app)
      .get("/api/auth/self-service/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("No entity associated with this token");
  });

  it("should return empty submissions array for valid token with entity", async () => {
    const token = createValidToken();

    const response = await request(app)
      .get("/api/auth/self-service/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.submissions).toBeDefined();
    expect(response.body.submissions).toEqual([]);
  });

  it("should return submissions from audit trail", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "test-tenant",
      config: TEST_TENANT_CONFIG,
      edm: {
        getEntity: jest.fn().mockResolvedValue(TEST_ENTITY),
        getAllEntities: jest.fn().mockResolvedValue([TEST_ENTITY]),
        getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([
          {
            guid: "event-1",
            action: "update-individual",
            entityGuid: "entity-guid-1",
            userId: "self-service:test-entity-1",
            timestamp: "2026-01-15T10:00:00Z",
          },
          {
            guid: "event-2",
            action: "change-address",
            entityGuid: "entity-guid-1",
            userId: "self-service:test-entity-1",
            timestamp: "2026-01-16T12:00:00Z",
          },
          {
            guid: "event-3",
            action: "update-individual",
            entityGuid: "entity-guid-1",
            userId: "agent:field-worker-1",
            timestamp: "2026-01-14T08:00:00Z",
          },
        ]),
        submitForm: jest.fn(),
      } as never,
    });

    const token = createValidToken();

    const response = await request(app)
      .get("/api/auth/self-service/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    // Only self-service submissions should be returned (not agent submissions)
    expect(response.body.submissions).toHaveLength(2);
    // Sorted by creation time descending (most recent first)
    expect(response.body.submissions[0].eventType).toBe("change-address");
    expect(response.body.submissions[1].eventType).toBe("update-individual");
    // All returned submissions should have approved status
    expect(response.body.submissions[0].status).toBe("approved");
    expect(response.body.submissions[1].status).toBe("approved");
  });

  it("should return 404 when tenant is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);
    const token = createValidToken();

    const response = await request(app)
      .get("/api/auth/self-service/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Tenant not found");
  });
});

// ─── 6. Scope hardening ───

describe("Scope hardening", () => {
  let app: express.Express;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAppInstanceStore = createMockAppInstanceStore();

    const mockOtpStore = {
      initialize: jest.fn(),
      createOtp: jest.fn(),
      verifyOtp: jest.fn(),
      getActiveCodesByIdentifier: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(mockOtpStore as never, mockAppInstanceStore));
    app.use(errorHandler);
  });

  it("should reject tokens with wrong scope on GET /self-service/entity", async () => {
    const token = createWrongScopeToken();

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden: self-service scope required");
  });

  it("should reject tokens with wrong scope on POST /self-service/submit", async () => {
    const token = createWrongScopeToken();

    const response = await request(app)
      .post("/api/auth/self-service/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ formType: "update-individual", formData: { name: "Updated" } });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden: self-service scope required");
  });

  it("should reject tokens with wrong scope on GET /self-service/submissions", async () => {
    const token = createWrongScopeToken();

    const response = await request(app)
      .get("/api/auth/self-service/submissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden: self-service scope required");
  });

  it("should reject requests with non-bearer auth type", async () => {
    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", "Basic dXNlcjpwYXNz");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should reject requests with expired token", async () => {
    const expiredToken = jwt.sign(
      { scope: "self-service", identifier: "test-entity-1", entityGuid: "entity-guid-1", tenantId: "test-tenant" },
      JWT_SECRET,
      { expiresIn: "0s" },
    );

    // Small delay to ensure the token is expired
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await request(app)
      .get("/api/auth/self-service/entity")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should reject tokens signed with wrong secret", async () => {
    const wrongSecretToken = jwt.sign(
      { scope: "self-service", identifier: "test-entity-1", entityGuid: "entity-guid-1", tenantId: "test-tenant" },
      "wrong-secret-key",
      { expiresIn: "1h" },
    );

    const response = await request(app)
      .get("/api/auth/self-service/entity")
      .set("Authorization", `Bearer ${wrongSecretToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid token");
  });

  it("should prevent cross-entity access via entityGuid in request params", async () => {
    // Token is for entity-guid-1, but trying to access entity-guid-2
    const token = createValidToken();

    const response = await request(app)
      .get("/api/auth/self-service/entity")
      .set("Authorization", `Bearer ${token}`)
      .query({ entityGuid: "entity-guid-2" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden: cannot access other entities");
  });
});
