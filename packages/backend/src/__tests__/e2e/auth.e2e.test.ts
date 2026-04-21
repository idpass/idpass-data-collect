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

import request from "supertest";
import { SyncServerInstance } from "../../types";
import {
  setup,
  teardown,
  describeIfPostgres,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "./setup";

describeIfPostgres("Auth e2e", () => {
  let app: SyncServerInstance;
  let adminToken: string;
  let ctx: Awaited<ReturnType<typeof setup>> | undefined;

  beforeAll(async () => {
    ctx = await setup();
    app = ctx.app;
    adminToken = ctx.adminToken;
  });

  afterAll(async () => {
    await teardown(ctx);
  });

  describe("POST /api/users/login", () => {
    it("returns a JWT token for valid admin credentials", async () => {
      const res = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      expect(typeof res.body.token).toBe("string");
      expect(res.body).toHaveProperty("userId");
    });

    it("rejects invalid password", async () => {
      const res = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: ADMIN_EMAIL, password: "wrong-password" });

      expect(res.status).toBe(401);
    });

    it("rejects non-existent user", async () => {
      const res = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: "nobody@test.lan", password: "whatever" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/users/check-token", () => {
    it("accepts a valid token", async () => {
      const res = await request(app.httpServer)
        .get("/api/users/check-token")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Token is valid" });
    });

    it("rejects a missing Authorization header", async () => {
      const res = await request(app.httpServer).get("/api/users/check-token");

      expect(res.status).toBe(401);
    });

    it("rejects an invalid token", async () => {
      const res = await request(app.httpServer)
        .get("/api/users/check-token")
        .set("Authorization", "Bearer invalid.token.value");

      expect(res.status).toBe(401);
    });
  });

  describe("Protected endpoints require auth", () => {
    it("GET /api/users returns 401 without token", async () => {
      const res = await request(app.httpServer).get("/api/users");
      expect(res.status).toBe(401);
    });

    it("GET /api/apps returns 401 without token", async () => {
      const res = await request(app.httpServer).get("/api/apps");
      expect(res.status).toBe(401);
    });
  });

  describe("User management (admin-only)", () => {
    const userEmail = "e2e-user@test.lan";
    const userPassword = "User-password-123!";

    it("admin can create a new user", async () => {
      const res = await request(app.httpServer)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: userEmail, password: userPassword, role: "USER" });

      expect(res.status).toBe(201);
    });

    it("new user can login", async () => {
      const res = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: userEmail, password: userPassword });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
    });

    it("non-admin user cannot list users", async () => {
      const loginRes = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: userEmail, password: userPassword });

      const userToken = loginRes.body.token;

      const res = await request(app.httpServer)
        .get("/api/users")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it("admin can list users", async () => {
      const res = await request(app.httpServer)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const emails = res.body.map((u: { email: string }) => u.email);
      expect(emails).toContain(ADMIN_EMAIL);
      expect(emails).toContain(userEmail);
    });

    it("admin can delete a user", async () => {
      const res = await request(app.httpServer)
        .delete(`/api/users/${userEmail}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verify deleted user cannot login
      const loginRes = await request(app.httpServer)
        .post("/api/users/login")
        .send({ email: userEmail, password: userPassword });

      expect(loginRes.status).toBe(401);
    });
  });
});
