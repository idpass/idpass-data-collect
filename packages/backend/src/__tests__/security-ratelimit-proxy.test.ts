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
 * Security: IP-based rate limiting cannot be bypassed via X-Forwarded-For.
 *
 * resolveTrustProxy defaults to not trusting the header, and the login limiter
 * keys on the real connection IP, so rotating X-Forwarded-For does not mint a
 * fresh rate-limit bucket per request.
 */
import "dotenv/config";
import request from "supertest";
import { run, resolveTrustProxy } from "../syncServer";
import { SyncServerInstance } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return { createLogger: () => silentLogger.child({ component: "test" }), logger: silentLogger };
});

describe("resolveTrustProxy", () => {
  it("defaults to false when unset or empty", () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy("")).toBe(false);
  });

  it("parses boolean strings", () => {
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy("false")).toBe(false);
  });

  it("parses non-negative hop counts as numbers", () => {
    expect(resolveTrustProxy("0")).toBe(0);
    expect(resolveTrustProxy("1")).toBe(1);
    expect(resolveTrustProxy("3")).toBe(3);
  });

  it("passes through subnet/preset strings", () => {
    expect(resolveTrustProxy("loopback")).toBe("loopback");
    expect(resolveTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });
});

const postgresUrl = getConnectionString("ratelimit_proxy");
const ADMIN_EMAIL = "admin-ratelimit@example.com";
const ADMIN_PW = "AdminRate123!";

describeIfPostgres("Login rate limiting (live)", () => {
  let app: SyncServerInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = "ratelimit-proxy-test-secret-32-characters";
    // Default behaviour: trust no proxy, so X-Forwarded-For is ignored.
    delete process.env.TRUST_PROXY;
    await ensureDatabaseExists(postgresUrl);
    app = await run({ port: 0, adminPassword: ADMIN_PW, adminEmail: ADMIN_EMAIL, postgresUrl });
  });

  afterAll(async () => {
    await app.clearStore();
    await app.closeConnection();
  });

  it("login limiter is not bypassed by rotating X-Forwarded-For", async () => {
    let got429 = false;
    for (let i = 0; i < 30; i++) {
      const r = await request(app.httpServer)
        .post("/api/users/login")
        .set("X-Forwarded-For", `10.9.8.${i}`)
        .send({ email: "ghost@nowhere.test", password: "WhateverPass1!" });
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
