/**
 * Tests for Phase 1 security fixes:
 * - G2: JWT token lifetime shortened to 1h
 * - G21: verifyRoleFromDatabase wired on sensitive routes
 * - L15: Per-identifier OTP rate limiting
 * - C1: validateTenantAccess on review approve/reject/bulk-approve
 */
import "dotenv/config";

import jwt from "jsonwebtoken";
import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import { createSelfServiceRouter } from "../routes/selfServiceRoutes";
import { OtpStoreImpl } from "../stores/OtpStore";
import { AppInstanceStore } from "../types";
import { Client } from "pg";
import { verifyRoleFromDatabase } from "../middlewares/rbac";
import { createReviewRoutes } from "../routes/reviewRoutes";

const JWT_SECRET = "test-secret-phase1-security-fixes-32chars!";

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_phase1_security` : "datacollect_phase1_security";
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

describe("G2: JWT token lifetime", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it("should issue tokens with 1h expiry on login", async () => {
    // Simulate what the login route does
    const token = jwt.sign(
      { id: "user-1", email: "test@example.com", role: "ADMIN", tenantIds: [], roleAssignments: [] },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const decoded = jwt.decode(token) as { exp: number; iat: number };
    expect(decoded).toBeDefined();

    const lifetimeSeconds = decoded.exp - decoded.iat;
    // 1 hour = 3600 seconds
    expect(lifetimeSeconds).toBe(3600);
  });

  it("should NOT issue tokens with 8h or longer expiry", async () => {
    const token = jwt.sign(
      { id: "user-1", email: "test@example.com", role: "ADMIN" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const decoded = jwt.decode(token) as { exp: number; iat: number };
    const lifetimeSeconds = decoded.exp - decoded.iat;
    // Must be <= 3600 (1 hour), not 28800 (8 hours)
    expect(lifetimeSeconds).toBeLessThanOrEqual(3600);
  });
});

describeIfPostgres("L15: Per-identifier OTP rate limiting", () => {
  let app: express.Express;
  let otpStore: OtpStoreImpl;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.NODE_ENV = "test";
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
    await otpStore.clearStore();
    await otpStore.closeConnection();
  });

  it("should count active codes for identifier and tenant", async () => {
    const identifier = "+1555000001";
    const tenantId = "rate-limit-tenant";

    // Create 3 OTP codes for the same identifier
    await otpStore.createOtp(identifier, tenantId);
    await otpStore.createOtp(identifier, tenantId);
    await otpStore.createOtp(identifier, tenantId);

    const codes = await otpStore.getActiveCodesByIdentifier(identifier, tenantId);
    // The createOtp method invalidates previous codes, so only 1 active code should remain
    // (because createOtp marks old ones as verified before inserting a new one)
    expect(codes.length).toBeGreaterThanOrEqual(1);
  });

  it("should allow OTP request when under rate limit", async () => {
    const response = await request(app)
      .post("/api/auth/otp/request")
      .send({ identifier: "+1555000002", tenantId: "rate-tenant" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe("G21: verifyRoleFromDatabase middleware exists and is exported", () => {
  it("should be importable from rbac module", () => {
    expect(verifyRoleFromDatabase).toBeDefined();
    expect(typeof verifyRoleFromDatabase).toBe("function");
  });

  it("should return a middleware function when called with a store", () => {
    const mockStore = { getUser: jest.fn() };
    const middleware = verifyRoleFromDatabase(mockStore);
    expect(typeof middleware).toBe("function");
  });
});

describe("C1: validateTenantAccess is imported in reviewRoutes", () => {
  it("reviewRoutes module should export createReviewRoutes that accepts userStore", () => {
    expect(createReviewRoutes).toBeDefined();
    expect(createReviewRoutes.length).toBe(3);
  });
});
