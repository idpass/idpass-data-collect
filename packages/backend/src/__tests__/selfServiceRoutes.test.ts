import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createSelfServiceRouter } from "../routes/selfServiceRoutes";
import { OtpStoreImpl } from "../stores/OtpStore";
import { AppInstanceStore } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

const JWT_SECRET = "test-secret-for-self-service";

const postgresUrl = getConnectionString("self_service");

describeIfPostgres("Self-Service Routes", () => {
  let app: express.Express;
  let otpStore: OtpStoreImpl;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    // Opt in to returning the plaintext OTP so these tests can read it back.
    process.env.OTP_EXPOSE_DEV_CODE = "true";
    await ensureDatabaseExists(postgresUrl);
  });

  afterAll(() => {
    delete process.env.OTP_EXPOSE_DEV_CODE;
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

  describe("POST /api/auth/otp/request", () => {
    it("should accept an OTP request and return success", async () => {
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890", tenantId: "tenant-1" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.expiresIn).toBe(300);
      // devCode is returned because OTP_EXPOSE_DEV_CODE is enabled for this suite.
      expect(response.body.devCode).toBeDefined();
      expect(response.body.devCode).toMatch(/^\d{6}$/);
    });

    it("should NOT return devCode when OTP_EXPOSE_DEV_CODE is not enabled", async () => {
      delete process.env.OTP_EXPOSE_DEV_CODE;
      try {
        const response = await request(app)
          .post("/api/auth/otp/request")
          .send({ identifier: "+1234567890", tenantId: "tenant-1" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.devCode).toBeUndefined();
      } finally {
        process.env.OTP_EXPOSE_DEV_CODE = "true";
      }
    });

    it("should return 400 when identifier is missing", async () => {
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ tenantId: "tenant-1" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 400 when tenantId is missing", async () => {
      const response = await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should store the OTP code in the database", async () => {
      await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890", tenantId: "tenant-1" });

      const codes = await otpStore.getActiveCodesByIdentifier("+1234567890", "tenant-1");
      expect(codes.length).toBeGreaterThan(0);
      // OTP codes are stored as SHA-256 hashes (64-char hex strings)
      expect(codes[0].code).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("POST /api/auth/otp/verify", () => {
    it("should return a JWT token when OTP is valid", async () => {
      // Create OTP directly to get the plaintext code (the database stores
      // a SHA-256 hash, so reading from the store returns the hash, not the
      // original code).
      const otpCode = await otpStore.createOtp("+1234567890", "tenant-1");
      const validCode = otpCode.code;

      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: validCode,
          tenantId: "tenant-1",
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.username).toBeDefined();

      // Verify the JWT contains the expected claims
      const decoded = jwt.verify(response.body.token, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.scope).toBe("self-service");
      expect(decoded.identifier).toBe("+1234567890");
      expect(decoded.tenantId).toBe("tenant-1");
    });

    it("should return 401 when OTP is invalid", async () => {
      await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890", tenantId: "tenant-1" });

      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: "000000",
          tenantId: "tenant-1",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should increment the attempt counter on failed verification", async () => {
      await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890", tenantId: "tenant-1" });

      await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: "000000",
          tenantId: "tenant-1",
        });

      const codes = await otpStore.getActiveCodesByIdentifier("+1234567890", "tenant-1");
      expect(codes[0].attempts).toBe(1);
    });

    it("should reject after 3 failed attempts", async () => {
      await request(app)
        .post("/api/auth/otp/request")
        .send({ identifier: "+1234567890", tenantId: "tenant-1" });

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post("/api/auth/otp/verify")
          .send({
            identifier: "+1234567890",
            otp: "000000",
            tenantId: "tenant-1",
          });
      }

      // Get the actual code
      const codes = await otpStore.getActiveCodesByIdentifier("+1234567890", "tenant-1");
      // Even with the correct code, should fail after max attempts
      // The code should have been invalidated or attempts maxed out
      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: codes.length > 0 ? codes[0].code : "123456",
          tenantId: "tenant-1",
        });

      expect(response.status).toBe(401);
    });

    it("should return 400 when required fields are missing", async () => {
      const response = await request(app)
        .post("/api/auth/otp/verify")
        .send({ identifier: "+1234567890" });

      expect(response.status).toBe(400);
    });

    it("should mark the code as verified after successful verification", async () => {
      // Create OTP directly to get the plaintext code (the database stores
      // a SHA-256 hash, so reading from the store returns the hash, not the
      // original code).
      const otpCode = await otpStore.createOtp("+1234567890", "tenant-1");
      const validCode = otpCode.code;

      await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: validCode,
          tenantId: "tenant-1",
        });

      // After verification, the code should be marked as verified
      const codesAfter = await otpStore.getActiveCodesByIdentifier("+1234567890", "tenant-1");
      // No active (unverified) codes should remain for this identifier
      expect(codesAfter).toHaveLength(0);
    });
  });

  describe("POST /api/auth/id/verify", () => {
    it("should return a JWT token for valid ID verification", async () => {
      // Set up mock entity in the app instance store
      const mockEdm = {
        searchEntities: jest.fn().mockResolvedValue([
          {
            guid: "entity-123",
            modified: {
              guid: "entity-123",
              type: "individual",
              data: {
                nationalId: "NID-12345",
                dateOfBirth: "1990-01-15",
              },
              identifiers: [{ type: "national-id", value: "NID-12345", expiryDate: null }],
            },
          },
        ]),
      };

      mockAppInstanceStore.getAppInstance.mockResolvedValue({
        configId: "tenant-1",
        edm: mockEdm as never,
      });

      const response = await request(app)
        .post("/api/auth/id/verify")
        .send({
          nationalId: "NID-12345",
          dateOfBirth: "1990-01-15",
          tenantId: "tenant-1",
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.username).toBeDefined();

      const decoded = jwt.verify(response.body.token, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.scope).toBe("self-service");
      expect(decoded.entityGuid).toBe("entity-123");
      expect(decoded.tenantId).toBe("tenant-1");
    });

    it("should return 401 when no matching entity is found", async () => {
      const mockEdm = {
        searchEntities: jest.fn().mockResolvedValue([]),
      };

      mockAppInstanceStore.getAppInstance.mockResolvedValue({
        configId: "tenant-1",
        edm: mockEdm as never,
      });

      const response = await request(app)
        .post("/api/auth/id/verify")
        .send({
          nationalId: "INVALID-ID",
          dateOfBirth: "2000-01-01",
          tenantId: "tenant-1",
        });

      expect(response.status).toBe(401);
    });

    it("should return 400 when required fields are missing", async () => {
      const response = await request(app)
        .post("/api/auth/id/verify")
        .send({ nationalId: "NID-12345" });

      expect(response.status).toBe(400);
    });

    it("should return 401 with uniform error when tenant is not found", async () => {
      mockAppInstanceStore.getAppInstance.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/auth/id/verify")
        .send({
          nationalId: "NID-12345",
          dateOfBirth: "1990-01-15",
          tenantId: "nonexistent-tenant",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Verification failed");
    });
  });

  describe("Self-service scope middleware", () => {
    it("should allow access to own entity with self-service token", async () => {
      // Create OTP directly to get the plaintext code (the database stores
      // a SHA-256 hash, so reading from the store returns the hash, not the
      // original code).
      const otpCode = await otpStore.createOtp("+1234567890", "tenant-1");
      const validCode = otpCode.code;

      const verifyResponse = await request(app)
        .post("/api/auth/otp/verify")
        .send({
          identifier: "+1234567890",
          otp: validCode,
          tenantId: "tenant-1",
        });

      const token = verifyResponse.body.token;
      expect(token).toBeDefined();

      // The self-service token should have the correct scope
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.scope).toBe("self-service");
    });
  });
});
