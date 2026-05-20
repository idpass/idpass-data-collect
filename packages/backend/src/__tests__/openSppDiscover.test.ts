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
 * Tests for POST /api/openspp/programs/discover.
 *
 * Mocking strategy: jest.mock("@idpass/adapter-openspp") replaces the
 * OpenSppV2Client class entirely. The route handler `new`s the client and
 * calls `authenticate()` + `listPrograms()`, so we control behaviour by
 * stubbing those two methods per test. This avoids needing to reach into
 * the private `httpClient` (which `axios-mock-adapter` would do) — the
 * client is constructed fresh inside the handler, so we can't grab the
 * instance from the test.
 */

import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";

// Mock the adapter module BEFORE importing the route. The route file
// imports OpenSppV2Client; jest.mock replaces it with our stub class so we
// can drive `authenticate` and `listPrograms` behaviour per test.
const mockAuthenticate = jest.fn();
const mockListPrograms = jest.fn();
const mockCtor = jest.fn();

jest.mock("@idpass/adapter-openspp", () => ({
  OpenSppV2Client: jest.fn().mockImplementation((cfg: unknown) => {
    mockCtor(cfg);
    return {
      authenticate: mockAuthenticate,
      listPrograms: mockListPrograms,
    };
  }),
}));

import { createOpenSppRoutes } from "../routes/openSppRoutes";

const JWT_SECRET = "test-secret-openspp-discover-32chars!!";
const ADMIN_TOKEN = jwt.sign(
  { id: 1, email: "admin@example.com", role: "ADMIN" },
  JWT_SECRET,
  { expiresIn: "1h" },
);
const USER_TOKEN = jwt.sign(
  { id: 2, email: "user@example.com", role: "USER" },
  JWT_SECRET,
  { expiresIn: "1h" },
);

function buildApp() {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/openspp", createOpenSppRoutes());
  return app;
}

const VALID_BODY = {
  url: "https://openspp.test",
  clientId: "client-abc",
  clientSecret: "secret-xyz",
};

describe("POST /api/openspp/programs/discover", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    mockAuthenticate.mockReset();
    mockListPrograms.mockReset();
    mockCtor.mockReset();
  });

  it("returns 200 with programs array on happy path", async () => {
    mockAuthenticate.mockResolvedValueOnce(undefined);
    mockListPrograms.mockResolvedValueOnce({
      programs: [
        {
          id: 3,
          name: "Widow Disability Support",
          code: "widow-disability",
          state: "active",
          targetType: "individual",
        },
      ],
      hasMore: false,
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ ...VALID_BODY, filter: { status: "active" } });

    expect(res.status).toBe(200);
    expect(res.body.programs).toHaveLength(1);
    expect(res.body.programs[0].name).toBe("Widow Disability Support");
    expect(res.body.total).toBe(1);
    expect(res.body.truncated).toBe(false);

    // The client was constructed with the body credentials
    expect(mockCtor).toHaveBeenCalledWith({
      baseUrl: VALID_BODY.url,
      clientId: VALID_BODY.clientId,
      clientSecret: VALID_BODY.clientSecret,
    });
    // listPrograms received the filter merged with default count
    expect(mockListPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", count: 100 }),
    );
  });

  it("returns 502 with openspp_auth_failed when authenticate throws", async () => {
    mockAuthenticate.mockRejectedValueOnce(
      new Error("OAuth2 authentication failed: Unauthorized (status=401)"),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("openspp_auth_failed");
    expect(res.body.detail).toContain("OAuth2 authentication failed");
    expect(mockListPrograms).not.toHaveBeenCalled();
  });

  it("returns 502 when the upstream times out / network error during auth", async () => {
    // Simulate a network-level timeout — surfaces as an Error from the
    // adapter (axios wraps ETIMEDOUT/ECONNABORTED). We just need the
    // route to map any auth-throw to 502.
    mockAuthenticate.mockRejectedValueOnce(
      Object.assign(new Error("timeout of 30000ms exceeded"), { code: "ECONNABORTED" }),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("openspp_auth_failed");
    expect(res.body.detail).toContain("timeout");
  });

  it("returns 400 on a malformed body (url is not a URL)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ url: "not-a-url", clientId: "c", clientSecret: "s" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid discover payload");
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockListPrograms).not.toHaveBeenCalled();
  });

  it("rejects callers without an admin role with 401/403", async () => {
    const app = buildApp();

    // Missing token -> 401
    const noTokenRes = await request(app)
      .post("/api/openspp/programs/discover")
      .send(VALID_BODY);
    expect(noTokenRes.status).toBe(401);

    // USER-role token -> 403
    const userRes = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${USER_TOKEN}`)
      .send(VALID_BODY);
    expect(userRes.status).toBe(403);

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockListPrograms).not.toHaveBeenCalled();
  });

  it("returns 502 with openspp_listprograms_failed when listPrograms throws", async () => {
    mockAuthenticate.mockResolvedValueOnce(undefined);
    mockListPrograms.mockRejectedValueOnce(new Error("upstream 500"));

    const app = buildApp();
    const res = await request(app)
      .post("/api/openspp/programs/discover")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("openspp_listprograms_failed");
    expect(res.body.detail).toContain("upstream 500");
  });
});
