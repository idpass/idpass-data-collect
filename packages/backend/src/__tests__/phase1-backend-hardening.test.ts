/**
 * Tests for Phase 1 Backend Security Hardening:
 * - Phase 1a: entityGuid enforcement in self-service scope middleware
 * - Phase 1b: Uniform error messages for brute-force protection
 * - Phase 1b: Rate limiter on public config endpoint
 * - Phase 1b: Languages exposed in public config
 * - Phase 1c: Dynamic availableForms from tenant config with Form.io schemas
 */
import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createSelfServiceRouter, requireSelfServiceScope } from "../routes/selfServiceRoutes";
import { createAppConfigRoutes } from "../routes/appConfigRoutes";
import { OtpStoreImpl } from "../stores/OtpStore";
import { AppInstanceStore, AppConfigStore, AppConfig } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

const JWT_SECRET = "test-secret-phase1-hardening-32chars!!";

const postgresUrl = getConnectionString("phase1_hardening");

// ─── Phase 1a: entityGuid enforcement in middleware ───

describe("Phase 1a: requireSelfServiceScope entityGuid enforcement", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it("should allow tokens without entityGuid through middleware (handler-level enforcement)", async () => {
    const app = express();
    app.use(bodyParser.json());

    // Mount a test route behind the middleware
    app.get("/test", requireSelfServiceScope, (req, res) => {
      res.json({ ok: true });
    });

    const tokenWithoutEntityGuid = jwt.sign(
      { scope: "self-service", identifier: "+1234567890", tenantId: "tenant-1" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app).get("/test").set("Authorization", `Bearer ${tokenWithoutEntityGuid}`);

    // entityGuid enforcement is at the handler level, not middleware level,
    // because OTP verification issues tokens before an entity is associated.
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("should allow tokens with entityGuid", async () => {
    const app = express();
    app.use(bodyParser.json());

    app.get("/test", requireSelfServiceScope, (req, res) => {
      res.json({ ok: true });
    });

    const tokenWithEntityGuid = jwt.sign(
      { scope: "self-service", identifier: "+1234567890", entityGuid: "entity-abc", tenantId: "tenant-1" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app).get("/test").set("Authorization", `Bearer ${tokenWithEntityGuid}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("should still reject tokens with wrong scope", async () => {
    const app = express();
    app.use(bodyParser.json());

    app.get("/test", requireSelfServiceScope, (req, res) => {
      res.json({ ok: true });
    });

    const wrongScopeToken = jwt.sign(
      { scope: "admin", identifier: "+1234567890", entityGuid: "entity-abc", tenantId: "tenant-1" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const response = await request(app).get("/test").set("Authorization", `Bearer ${wrongScopeToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Forbidden: self-service scope required");
  });
});

// ─── Phase 1b: Uniform error messages ───

describeIfPostgres("Phase 1b: Uniform error messages for brute-force protection", () => {
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

    mockAppInstanceStore = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn().mockResolvedValue(null),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(otpStore, mockAppInstanceStore));
  });

  afterEach(async () => {
    if (!otpStore) return;
    await otpStore.clearStore();
    await otpStore.closeConnection();
  });

  it("/id/verify should return uniform self-service-disabled error when tenant not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

    const response = await request(app).post("/api/auth/id/verify").send({
      nationalId: "NID-12345",
      dateOfBirth: "1990-01-15",
      tenantId: "nonexistent-tenant",
    });

    // Self-service gate runs first; uniform 403 regardless of tenant existence.
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Self-service is not enabled for this tenant");
  });

  it("/id/verify should return uniform 'Verification failed' when identity not found", async () => {
    const mockEdm = {
      searchEntities: jest.fn().mockResolvedValue([]),
    };

    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-1",
      config: { id: "tenant-1", name: "Test", selfService: { enabled: true } } as AppConfig,
      edm: mockEdm as never,
    });

    const response = await request(app).post("/api/auth/id/verify").send({
      nationalId: "INVALID-ID",
      dateOfBirth: "2000-01-01",
      tenantId: "tenant-1",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Verification failed");
  });

  it("/id/verify should NOT leak 'Tenant not found' or 'Identity not found' messages", async () => {
    // Tenant not found case
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

    const tenantResponse = await request(app).post("/api/auth/id/verify").send({
      nationalId: "NID-12345",
      dateOfBirth: "1990-01-15",
      tenantId: "nonexistent-tenant",
    });

    expect(tenantResponse.body.error).not.toContain("Tenant not found");
    expect(tenantResponse.body.error).not.toContain("Identity not found");

    // Identity not found case
    const mockEdm = {
      searchEntities: jest.fn().mockResolvedValue([]),
    };

    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-1",
      config: { id: "tenant-1", name: "Test" } as AppConfig,
      edm: mockEdm as never,
    });

    const identityResponse = await request(app).post("/api/auth/id/verify").send({
      nationalId: "INVALID-ID",
      dateOfBirth: "2000-01-01",
      tenantId: "tenant-1",
    });

    expect(identityResponse.body.error).not.toContain("Tenant not found");
    expect(identityResponse.body.error).not.toContain("Identity not found");
  });

  it("/oidc/exchange should return uniform self-service-disabled error when tenant not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "fake.token.value",
      accessToken: "fake-access-token",
      tenantId: "nonexistent-tenant",
    });

    // Self-service gate runs first; uniform 403 regardless of tenant existence.
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Self-service is not enabled for this tenant");
  });

  it("/oidc/exchange should NOT leak 'Tenant not found' message", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

    const response = await request(app).post("/api/auth/oidc/exchange").send({
      idToken: "fake.token.value",
      accessToken: "fake-access-token",
      tenantId: "nonexistent-tenant",
    });

    expect(response.body.error).not.toContain("Tenant not found");
  });
});

// ─── Phase 1b: Rate limiter on public config endpoint ───

describe("Phase 1b: Public config endpoint rate limiter", () => {
  it("should have rate limiting middleware on the public config route", async () => {
    const mockAppConfigStore: jest.Mocked<AppConfigStore> = {
      initialize: jest.fn(),
      getConfigs: jest.fn().mockResolvedValue([]),
      getConfig: jest.fn().mockResolvedValue({
        id: "test-tenant",
        name: "Test Tenant",
        description: "A test tenant",
      }),
      getConfigByArtifactId: jest.fn(),
      saveConfig: jest.fn(),
      archiveConfig: jest.fn(),
      restoreConfig: jest.fn(),
      deleteConfig: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppConfigStore>;

    const mockAppInstanceStore: jest.Mocked<AppInstanceStore> = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn().mockResolvedValue(null),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;

    const app = express();
    app.use(bodyParser.json());
    app.use("/api/apps", createAppConfigRoutes(mockAppConfigStore, mockAppInstanceStore));

    // A single request should succeed
    const response = await request(app).get("/api/apps/test-tenant/public");

    expect(response.status).toBe(200);
    // Rate limit headers should be present (draft-7 uses combined RateLimit header)
    expect(response.headers["ratelimit-policy"]).toBeDefined();
    expect(response.headers["ratelimit"]).toBeDefined();
  });
});

// ─── Phase 1b: Languages in public config ───

describe("Phase 1b: Languages exposed in public config", () => {
  let app: express.Express;
  let mockAppConfigStore: jest.Mocked<AppConfigStore>;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeEach(() => {
    mockAppConfigStore = {
      initialize: jest.fn(),
      getConfigs: jest.fn().mockResolvedValue([]),
      getConfig: jest.fn(),
      getConfigByArtifactId: jest.fn(),
      saveConfig: jest.fn(),
      archiveConfig: jest.fn(),
      restoreConfig: jest.fn(),
      deleteConfig: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppConfigStore>;

    mockAppInstanceStore = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn().mockResolvedValue(null),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;

    app = express();
    app.use(bodyParser.json());
    app.use("/api/apps", createAppConfigRoutes(mockAppConfigStore, mockAppInstanceStore));
  });

  it("should include languages in the public config when selfService is configured", async () => {
    mockAppConfigStore.getConfig.mockResolvedValue({
      id: "tenant-multilang",
      name: "Multi-Language Tenant",
      selfService: {
        enabled: true,
        authMethods: ["id"],
        allowedForms: ["update-individual"],
        languages: ["en", "fr", "km"],
        requireReview: false,
      },
    } as AppConfig);

    const response = await request(app).get("/api/apps/tenant-multilang/public");

    expect(response.status).toBe(200);
    expect(response.body.selfService).toBeDefined();
    expect(response.body.selfService.languages).toEqual(["en", "fr", "km"]);
  });

  it("should default languages to ['en'] when selfService has no languages", async () => {
    mockAppConfigStore.getConfig.mockResolvedValue({
      id: "tenant-nolang",
      name: "No Language Tenant",
      selfService: {
        enabled: true,
        authMethods: ["otp"],
        allowedForms: [],
        languages: undefined,
        requireReview: false,
      },
    } as unknown as AppConfig);

    const response = await request(app).get("/api/apps/tenant-nolang/public");

    expect(response.status).toBe(200);
    expect(response.body.selfService.languages).toEqual(["en"]);
  });

  it("should not include selfService section when not configured", async () => {
    mockAppConfigStore.getConfig.mockResolvedValue({
      id: "tenant-noselfservice",
      name: "No Self-Service Tenant",
    } as AppConfig);

    const response = await request(app).get("/api/apps/tenant-noselfservice/public");

    expect(response.status).toBe(200);
    expect(response.body.selfService).toBeUndefined();
  });
});

// ─── Phase 1c: Dynamic availableForms with Form.io schemas ───

describeIfPostgres("Phase 1c: Dynamic availableForms from tenant config", () => {
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

    mockAppInstanceStore = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn(),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;

    app = express();
    app.use(bodyParser.json());
    app.use("/api/auth", createSelfServiceRouter(otpStore, mockAppInstanceStore));
  });

  afterEach(async () => {
    if (!otpStore) return;
    await otpStore.clearStore();
    await otpStore.closeConnection();
  });

  function createSelfServiceToken(entityGuid: string, tenantId: string): string {
    return jwt.sign({ scope: "self-service", identifier: entityGuid, entityGuid, tenantId }, JWT_SECRET, {
      expiresIn: "1h",
    });
  }

  it("should return forms from tenant config with Form.io schemas", async () => {
    const mockEntityForms = [
      {
        id: "form-1",
        name: "update-individual",
        title: "Update Profile",
        formio: { components: [{ type: "textfield", key: "name", label: "Name" }] },
      },
      {
        id: "form-2",
        name: "change-address",
        title: "Change Address",
        formio: { components: [{ type: "textfield", key: "address", label: "Address" }] },
      },
    ];

    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-forms",
      config: {
        id: "tenant-forms",
        name: "Forms Tenant",
        entityForms: mockEntityForms,
        selfService: {
          enabled: true,
          authMethods: ["id"],
          allowedForms: ["update-individual", "change-address"],
          languages: ["en"],
          requireReview: false,
        },
      } as AppConfig,
      edm: {
        getEntity: jest.fn().mockResolvedValue({
          modified: {
            guid: "entity-123",
            data: { name: "Test User" },
            lastUpdated: "2026-01-01T00:00:00Z",
          },
        }),
      } as never,
    });

    const token = createSelfServiceToken("entity-123", "tenant-forms");

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.availableForms).toHaveLength(2);

    const updateForm = response.body.availableForms.find((f: { type: string }) => f.type === "update-individual");
    expect(updateForm).toBeDefined();
    expect(updateForm.label).toBe("Update Profile");
    expect(updateForm.formio).toBeDefined();
    expect(updateForm.formio.components).toHaveLength(1);
    expect(updateForm.formio.components[0].key).toBe("name");

    const addressForm = response.body.availableForms.find((f: { type: string }) => f.type === "change-address");
    expect(addressForm).toBeDefined();
    expect(addressForm.label).toBe("Change Address");
    expect(addressForm.formio).toBeDefined();
  });

  it("should use form name as label when form config is not found", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-missing-form",
      config: {
        id: "tenant-missing-form",
        name: "Missing Form Tenant",
        entityForms: [],
        selfService: {
          enabled: true,
          authMethods: ["id"],
          allowedForms: ["unknown-form"],
          languages: ["en"],
          requireReview: false,
        },
      } as AppConfig,
      edm: {
        getEntity: jest.fn().mockResolvedValue({
          modified: {
            guid: "entity-456",
            data: { name: "Test" },
            lastUpdated: "2026-01-01T00:00:00Z",
          },
        }),
      } as never,
    });

    const token = createSelfServiceToken("entity-456", "tenant-missing-form");

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.availableForms).toHaveLength(1);
    expect(response.body.availableForms[0].type).toBe("unknown-form");
    expect(response.body.availableForms[0].label).toBe("unknown-form");
    expect(response.body.availableForms[0].formio).toBeUndefined();
  });

  it("should fall back to generic 'Update Profile' form when no allowedForms configured", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-no-forms",
      config: {
        id: "tenant-no-forms",
        name: "No Forms Tenant",
        entityForms: [],
        selfService: {
          enabled: true,
          authMethods: ["id"],
          allowedForms: [],
          languages: ["en"],
          requireReview: false,
        },
      } as AppConfig,
      edm: {
        getEntity: jest.fn().mockResolvedValue({
          modified: {
            guid: "entity-789",
            data: { name: "Test" },
            lastUpdated: "2026-01-01T00:00:00Z",
          },
        }),
      } as never,
    });

    const token = createSelfServiceToken("entity-789", "tenant-no-forms");

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.availableForms).toHaveLength(1);
    expect(response.body.availableForms[0].type).toBe("update-individual");
    expect(response.body.availableForms[0].label).toBe("Update Profile");
  });

  it("should reject access when no selfService config at all (feature off by default)", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-no-ss",
      config: {
        id: "tenant-no-ss",
        name: "No SS Tenant",
      } as AppConfig,
      edm: {
        getEntity: jest.fn().mockResolvedValue({
          modified: {
            guid: "entity-000",
            data: { name: "Test" },
            lastUpdated: "2026-01-01T00:00:00Z",
          },
        }),
      } as never,
    });

    const token = createSelfServiceToken("entity-000", "tenant-no-ss");

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    // No selfService config means the feature is disabled (C2 gate).
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Self-service is not enabled for this tenant");
  });

  it("should match forms by id when name does not match", async () => {
    const mockEntityForms = [
      {
        id: "update-profile",
        name: "profile-update-form",
        title: "Profile Update",
        formio: { components: [{ type: "textfield", key: "fullName" }] },
      },
    ];

    mockAppInstanceStore.getAppInstance.mockResolvedValue({
      configId: "tenant-id-match",
      config: {
        id: "tenant-id-match",
        name: "ID Match Tenant",
        entityForms: mockEntityForms,
        selfService: {
          enabled: true,
          authMethods: ["id"],
          allowedForms: ["update-profile"],
          languages: ["en"],
          requireReview: false,
        },
      } as AppConfig,
      edm: {
        getEntity: jest.fn().mockResolvedValue({
          modified: {
            guid: "entity-id-match",
            data: { name: "Test" },
            lastUpdated: "2026-01-01T00:00:00Z",
          },
        }),
      } as never,
    });

    const token = createSelfServiceToken("entity-id-match", "tenant-id-match");

    const response = await request(app).get("/api/auth/self-service/entity").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.availableForms).toHaveLength(1);
    expect(response.body.availableForms[0].label).toBe("Profile Update");
    expect(response.body.availableForms[0].formio).toBeDefined();
  });
});
