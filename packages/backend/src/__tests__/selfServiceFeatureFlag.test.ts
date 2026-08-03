import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createSelfServiceRouter } from "../routes/selfServiceRoutes";
import { AppInstanceStore } from "../types";

/**
 * Self-service is gated behind a per-tenant feature flag (selfService.enabled)
 * that defaults to OFF. The feature is under rework and must stay hidden for
 * every config that has not explicitly opted in. These tests verify the gate
 * is enforced server-side — independent of PostgreSQL — so they stub both the
 * OtpStore and AppInstanceStore injected dependencies. Security finding: C2.
 */

const JWT_SECRET = "test-secret-feature-flag";

function makeAppInstanceStore(getAppInstance: jest.Mock): AppInstanceStore {
  return {
    initialize: jest.fn(),
    createAppInstance: jest.fn(),
    updateAppInstance: jest.fn(),
    loadEntityData: jest.fn(),
    getAppInstance,
    clearAppInstance: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as unknown as AppInstanceStore;
}

function makeOtpStore() {
  return {
    getActiveCodesByIdentifier: jest.fn().mockResolvedValue([]),
    createOtp: jest.fn().mockResolvedValue({ id: "otp-1", code: "123456" }),
    verifyOtp: jest.fn().mockResolvedValue({ entityGuid: "entity-1" }),
  } as never;
}

function buildApp(getAppInstance: jest.Mock) {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/auth", createSelfServiceRouter(makeOtpStore(), makeAppInstanceStore(getAppInstance)));
  return app;
}

function selfServiceToken(tenantId: string, entityGuid: string) {
  return jwt.sign({ scope: "self-service", identifier: entityGuid, entityGuid, tenantId }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

describe("Self-service feature flag (default OFF)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  describe("token issuance is blocked when self-service is not enabled", () => {
    it("returns 403 from /otp/request when selfService.enabled is false", async () => {
      const app = buildApp(jest.fn().mockResolvedValue({ configId: "t1", config: { selfService: { enabled: false } } }));

      const res = await request(app).post("/api/auth/otp/request").send({ identifier: "+15551234567", tenantId: "t1" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not enabled/i);
    });

    it("returns 403 from /id/verify when selfService config is absent", async () => {
      const app = buildApp(jest.fn().mockResolvedValue({ configId: "t1", config: {} }));

      const res = await request(app)
        .post("/api/auth/id/verify")
        .send({ nationalId: "NID-1", dateOfBirth: "1990-01-01", tenantId: "t1" });

      expect(res.status).toBe(403);
    });

    it("returns 403 from /otp/verify when the tenant instance is missing", async () => {
      const app = buildApp(jest.fn().mockResolvedValue(null));

      const res = await request(app)
        .post("/api/auth/otp/verify")
        .send({ identifier: "+15551234567", otp: "123456", tenantId: "t1" });

      expect(res.status).toBe(403);
    });

    it("returns 403 from /oidc/exchange when selfService.enabled is false", async () => {
      const app = buildApp(jest.fn().mockResolvedValue({ configId: "t1", config: { selfService: { enabled: false } } }));

      const res = await request(app)
        .post("/api/auth/oidc/exchange")
        .send({ idToken: "a.b.c", accessToken: "x", tenantId: "t1" });

      expect(res.status).toBe(403);
    });
  });

  describe("authenticated self-service routes are blocked when not enabled", () => {
    it("returns 403 from GET /self-service/entity even with a valid self-service token", async () => {
      const app = buildApp(jest.fn().mockResolvedValue({ configId: "t1", config: { selfService: { enabled: false } } }));

      const res = await request(app)
        .get("/api/auth/self-service/entity")
        .set("Authorization", `Bearer ${selfServiceToken("t1", "entity-1")}`);

      expect(res.status).toBe(403);
    });
  });

  describe("issuance proceeds when self-service is explicitly enabled", () => {
    it("does not 403 /otp/request when selfService.enabled is true", async () => {
      const app = buildApp(
        jest.fn().mockResolvedValue({
          configId: "t1",
          config: { selfService: { enabled: true } },
          edm: { searchEntities: jest.fn().mockResolvedValue([]) },
        }),
      );

      const res = await request(app).post("/api/auth/otp/request").send({ identifier: "+15551234567", tenantId: "t1" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
