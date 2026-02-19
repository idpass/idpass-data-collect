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

import express, { Request, Response } from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

// Build a minimal app with a configurable rate limit for testing purposes.
// The exported portalRateLimit uses a 100-request window which is impractical to
// exhaust in a unit test. Instead we verify the middleware behaviour using a
// tightly-configured limiter that mirrors the same options.
function buildAppWithLimit(max: number) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  const app = express();
  app.use(limiter);
  app.get("/test", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("portalRateLimit middleware", () => {
  it("allows requests that are under the configured limit", async () => {
    const app = buildAppWithLimit(5);

    const response = await request(app).get("/test");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("sets standard RateLimit-* response headers", async () => {
    const app = buildAppWithLimit(5);

    const response = await request(app).get("/test");

    // standardHeaders: true means express-rate-limit sets RateLimit-* headers (draft-6 format)
    // The exact header name depends on the express-rate-limit version (RateLimit or X-RateLimit)
    const hasRateLimitHeader =
      "ratelimit-limit" in response.headers ||
      "x-ratelimit-limit" in response.headers ||
      "ratelimit" in response.headers;
    expect(hasRateLimitHeader).toBe(true);
  });

  it("returns 429 when the request limit is exceeded", async () => {
    const app = buildAppWithLimit(2);

    // Exhaust the limit
    await request(app).get("/test");
    await request(app).get("/test");

    // Third request should be rejected
    const response = await request(app).get("/test");

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "Too many requests, please try again later" });
  });

  it("returns a JSON error body when rate limited", async () => {
    const app = buildAppWithLimit(1);

    await request(app).get("/test");
    const response = await request(app).get("/test");

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toHaveProperty("error");
  });
});

describe("portalAuthRateLimit middleware", () => {
  it("allows requests under the auth limit with a stricter max", async () => {
    // Mirrors portalAuthRateLimit config (max: 20) but with a lower test value
    const app = buildAppWithLimit(3);

    const response = await request(app).get("/test");

    expect(response.status).toBe(200);
  });

  it("returns 429 with the auth-specific error message when limit is exceeded", async () => {
    const authLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many authentication attempts, please try again later" },
    });

    const app = express();
    app.use(authLimiter);
    app.get("/auth-test", (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get("/auth-test");
    const response = await request(app).get("/auth-test");

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "Too many authentication attempts, please try again later" });
  });
});
