/**
 * H5: Self-service JWT accepted on sync routes
 *
 * The createDynamicAuthMiddleware has a JWT fallback (authenticateJWTBackend)
 * that does not check the `scope` claim. A token with `scope: "self-service"`
 * should be rejected on sync routes, but the middleware accepts any valid JWT.
 *
 * This test creates the middleware with a mock appInstanceStore and verifies
 * it rejects self-service scoped tokens. No Postgres needed.
 *
 * File under test: packages/backend/src/middlewares/authentication.ts:82-100
 */
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { createDynamicAuthMiddleware } from "../middlewares/authentication";

const JWT_SECRET = "review-auth-scope-test-secret";

describe("H5: createDynamicAuthMiddleware must reject self-service scoped JWTs", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  function createMockAppInstanceStore(validateTokenResult: boolean) {
    return {
      getAppInstance: jest.fn().mockResolvedValue({
        configId: "test-config",
        edm: {
          validateToken: jest.fn().mockResolvedValue(validateTokenResult),
        },
      }),
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    };
  }

  test("self-service JWT should be rejected even when signature is valid", async () => {
    // The appInstance.edm.validateToken returns false, so the middleware
    // falls back to authenticateJWTBackend which accepts ANY valid JWT
    const store = createMockAppInstanceStore(false);
    const middleware = createDynamicAuthMiddleware(store);

    const selfServiceToken = jwt.sign(
      {
        scope: "self-service",
        identifier: "beneficiary-phone",
        tenantId: "test-config",
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const req = {
      headers: { authorization: `Bearer ${selfServiceToken}` },
      query: { configId: "test-config" },
      body: {},
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    // EXPECTED (secure): next() should NOT be called because the token
    // has scope: "self-service" which should not be allowed on sync routes
    // ACTUAL (vulnerable): next() IS called because authenticateJWTBackend
    // accepts any valid JWT without checking scope
    expect(next).not.toHaveBeenCalled();
  });

  test("self-service JWT with role smuggling should still be rejected", async () => {
    const store = createMockAppInstanceStore(false);
    const middleware = createDynamicAuthMiddleware(store);

    // An attacker might add role claims to a self-service token
    const smuggledToken = jwt.sign(
      {
        id: "attacker",
        email: "attacker@evil.com",
        scope: "self-service",
        role: "ADMIN",
        tenantIds: ["test-config"],
        roleAssignments: [],
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const req = {
      headers: { authorization: `Bearer ${smuggledToken}` },
      query: { configId: "test-config" },
      body: {},
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    // EXPECTED (secure): Rejected -- the token has scope: "self-service"
    // ACTUAL (vulnerable): Accepted -- authenticateJWTBackend ignores scope
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(expect.any(Number));
  });
});
