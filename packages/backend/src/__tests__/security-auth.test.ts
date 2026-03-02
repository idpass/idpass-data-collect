/**
 * Security tests: Authentication and authorization vulnerabilities
 *
 * Tests cover:
 * 1. JWT tokens lack expiration (CRITICAL)
 * 2. Self-service JWT accepted on sync routes (MEDIUM)
 * 3. validateTenantAccess bypasses for non-JWT requests (MEDIUM)
 *
 * These tests MUST FAIL against the current codebase.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import request from "supertest";
import { Client } from "pg";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { createDynamicAuthMiddleware, validateTenantAccess } from "../middlewares/authentication";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
});

const JWT_SECRET = "test-secret-for-security-tests";

const mockConfig: AppConfig = {
  id: "sec-auth-config",
  artifactId: "sec-auth-artifact",
  name: "Security Auth Test Config",
  description: "Test config for auth security tests",
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

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_sec_auth` : "datacollect_sec_auth";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const postgresUrl = getConnectionString();
const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

describeIfPostgres("SECURITY: Authentication vulnerabilities", () => {
  let app: SyncServerInstance | null = null;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await ensureDatabaseExists(postgresUrl);
  });

  beforeEach(async () => {
    if (app) {
      await app.closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin-sec-test-1@",
      adminEmail: "admin-sec@example.com",
      postgresUrl,
    });
    await app.appConfigStore.saveConfig(mockConfig);
    await app.appInstanceStore.createAppInstance(mockConfig.id);
  });

  afterEach(async () => {
    if (app) {
      await app.clearStore();
      await app.closeConnection();
      app = null;
    }
  });

  describe("JWT token expiration", () => {
    test("login tokens MUST include an exp claim", async () => {
      // Login as admin to get a token
      const loginResponse = await request(app!.httpServer)
        .post("/api/users/login")
        .send({ email: "admin-sec@example.com", password: "admin-sec-test-1@" });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();

      // Decode the token WITHOUT verification to inspect the payload
      const decoded = jwt.decode(loginResponse.body.token) as Record<string, unknown>;

      // EXPECTED (secure): Token has an `exp` claim
      // ACTUAL (vulnerable): Token has NO `exp` claim, meaning it never expires
      expect(decoded).toHaveProperty("exp");
    });

    test("login tokens should expire within a reasonable timeframe", async () => {
      const loginResponse = await request(app!.httpServer)
        .post("/api/users/login")
        .send({ email: "admin-sec@example.com", password: "admin-sec-test-1@" });

      const decoded = jwt.decode(loginResponse.body.token) as Record<string, unknown>;

      // EXPECTED (secure): exp is set and is no more than 24 hours from now
      // ACTUAL (vulnerable): exp is undefined
      expect(decoded.exp).toBeDefined();
      if (decoded.exp) {
        const expiresAt = (decoded.exp as number) * 1000; // convert to ms
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        expect(expiresAt - now).toBeLessThanOrEqual(twentyFourHours);
      }
    });
  });

  describe("Self-service JWT on sync routes", () => {
    test("self-service JWT with admin role smuggled in should be REJECTED by auth layer", async () => {
      // Attack scenario: The createDynamicAuthMiddleware accepts ANY valid JWT
      // via the authenticateJWTBackend() fallback at line 98-102. This means a
      // self-service token that also includes an admin role claim passes through
      // both auth and RBAC layers.
      //
      // A real self-service token is issued by the server and doesn't include
      // role/tenantIds, but the JWT payload is just signed data -- if an attacker
      // can get a JWT signed with the server's secret that includes both
      // scope:"self-service" and role:"ADMIN", both layers accept it.
      //
      // More importantly: the dynamic auth middleware does NOT check the scope
      // claim at all. It accepts the token purely based on signature validation.
      // This test proves that the auth middleware does not differentiate between
      // scopes.

      const selfServiceTokenWithRole = jwt.sign(
        {
          id: "attacker",
          email: "attacker@evil.com",
          scope: "self-service",
          role: "ADMIN",
          identifier: "beneficiary-phone",
          entityGuid: "entity-123",
          tenantId: mockConfig.id,
          tenantIds: [mockConfig.id],
          roleAssignments: [],
        },
        JWT_SECRET,
        { expiresIn: "1h" },
      );

      const response = await request(app!.httpServer)
        .get(`/api/sync/pull?since=2020-01-01T00:00:00.000Z&configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${selfServiceTokenWithRole}`);

      // EXPECTED (secure): 401 or 403 -- self-service scoped tokens should NEVER
      // be accepted on sync routes, regardless of other claims
      // ACTUAL (vulnerable): 200 -- the dynamic auth middleware does not check
      // the scope claim, so a JWT with scope:"self-service" AND role:"ADMIN"
      // passes through authentication AND RBAC
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("createDynamicAuthMiddleware should reject tokens with self-service scope", async () => {
      // This test directly verifies the auth middleware behavior:
      // a self-service token should be rejected at the AUTH level, not deferred
      // to RBAC. The middleware should check the scope claim.

      const middleware = createDynamicAuthMiddleware(app!.appInstanceStore);

      const selfServiceToken = jwt.sign(
        {
          scope: "self-service",
          identifier: "test-phone",
          tenantId: mockConfig.id,
        },
        JWT_SECRET,
        { expiresIn: "1h" },
      );

      const req = {
        headers: { authorization: `Bearer ${selfServiceToken}` },
        query: { configId: mockConfig.id },
        body: {},
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      const next = jest.fn() as NextFunction;

      await middleware(req, res, next);

      // EXPECTED (secure): Should NOT call next(), should return 401/403
      // because self-service tokens should be rejected at the auth layer
      // ACTUAL (vulnerable): Calls next() because authenticateJWTBackend()
      // accepts any valid JWT signature without checking scope
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe("validateTenantAccess bypass", () => {
    test("validateTenantAccess should NOT call next() when req.user is absent", () => {
      const req = {
        headers: {},
        query: { configId: "some-tenant" },
        body: {},
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      const next = jest.fn() as NextFunction;

      // Call the middleware with NO user set on the request
      validateTenantAccess(req, res, next);

      // EXPECTED (secure): Should return 401 since there is no authenticated user
      // ACTUAL (vulnerable): Calls next() without any tenant validation,
      // because the middleware treats "no user" as "externally validated"
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("unauthenticated request should not bypass tenant validation via missing user", () => {
      // Simulate a request that somehow reaches validateTenantAccess
      // without going through any auth middleware first
      const req = {
        headers: {},
        query: { configId: "secret-tenant" },
        body: {},
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      const next = jest.fn() as NextFunction;

      validateTenantAccess(req, res, next);

      // EXPECTED (secure): Denied access -- should NOT pass through
      // ACTUAL (vulnerable): next() is called, allowing the request through
      expect(next).not.toHaveBeenCalled();
    });
  });
});
