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

import { createPortalAuthMiddleware, resetJWKSCache } from "../../middlewares/portalAuthentication";
import { NextFunction, Request, Response } from "express";

// Mock jose so no real Keycloak server is needed
jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue("mock-jwks"),
  jwtVerify: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jose = require("jose") as { createRemoteJWKSet: jest.Mock; jwtVerify: jest.Mock };

const ISSUER = "https://keycloak.example.com/realms/datacollect";
const CLIENT_ID = "datacollect-portal";

function buildRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function buildResponse(): { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("createPortalAuthMiddleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    resetJWKSCache();
    next = jest.fn();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest() as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Basic dXNlcjpwYXNz") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is just 'Bearer' with no token", async () => {
    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when jwtVerify throws (expired or invalid signature)", async () => {
    jose.jwtVerify.mockRejectedValue(new Error("JWTExpired: token is expired"));

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer expired.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid or expired token" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token audience does not match the expected client ID (string aud)", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-123",
        iss: ISSUER,
        aud: "wrong-client",
        azp: "wrong-client",
        email: "user@example.com",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("audience") }));
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token audience array does not include expected client ID", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-123",
        iss: ISSUER,
        aud: ["other-client", "another-client"],
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and sets portalUser when token has matching string aud", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-123",
        iss: ISSUER,
        aud: CLIENT_ID,
        email: "user@example.com",
        email_verified: true,
        name: "Test User",
        preferred_username: "testuser",
        given_name: "Test",
        family_name: "User",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portalUser = (req as any).portalUser;
    expect(portalUser.sub).toBe("user-123");
    expect(portalUser.email).toBe("user@example.com");
    expect(portalUser.email_verified).toBe(true);
    expect(portalUser.name).toBe("Test User");
    expect(portalUser.preferred_username).toBe("testuser");
    expect(portalUser.given_name).toBe("Test");
    expect(portalUser.family_name).toBe("User");
  });

  it("calls next() when token has matching audience in an array aud claim", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-456",
        iss: ISSUER,
        aud: ["account", CLIENT_ID],
        email: "user@example.com",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((req as any).portalUser.sub).toBe("user-456");
  });

  it("calls next() when token has matching azp claim (Keycloak confidential client flow)", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: "user-789",
        iss: ISSUER,
        aud: "account",
        azp: CLIENT_ID,
        email: "user@example.com",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((req as any).portalUser.sub).toBe("user-789");
  });

  it("returns 401 when payload.sub is missing", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        iss: ISSUER,
        aud: CLIENT_ID,
        email: "user@example.com",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when payload.sub is not a string", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: {
        sub: 12345,
        iss: ISSUER,
        aud: CLIENT_ID,
        email: "user@example.com",
      },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer valid.token.here") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the same cached JWKS instance for the same issuer on repeated calls", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: { sub: "user-1", aud: CLIENT_ID },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req1 = buildRequest("Bearer token1") as Request;
    const req2 = buildRequest("Bearer token2") as Request;
    const res1 = buildResponse() as unknown as Response;
    const res2 = buildResponse() as unknown as Response;

    await middleware(req1, res1, next);
    await middleware(req2, res2, next);

    // createRemoteJWKSet should only be called once because of the cache
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });

  it("creates a new JWKS instance after cache is reset", async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: { sub: "user-1", aud: CLIENT_ID },
    });

    const middleware = createPortalAuthMiddleware(ISSUER, CLIENT_ID);
    const req = buildRequest("Bearer token1") as Request;
    const res = buildResponse() as unknown as Response;

    await middleware(req, res, next);
    resetJWKSCache();
    await middleware(req, res, next);

    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });
});
