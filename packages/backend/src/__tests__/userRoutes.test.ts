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
 * Validates that {@link createUserRoutes} rejects deliver-nothing
 * `syncScopeOverride` payloads (#947 Phase 4 fixup).
 *
 * The lenient core schema (`syncScopePolicySchema`) accepts empty arrays for
 * round-tripping legacy/seed payloads, but admin-facing routes use the strict
 * `SYNC_SCOPE_SCHEMA` shared with `appConfigRoutes` so operators cannot
 * persist `{ areaIds: [] }` (which would block all events for the role).
 */
import "dotenv/config";

import request from "supertest";
import express from "express";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { createUserRoutes } from "../routes/userRoutes";
import { Role, UserStore, UserWithPasswordHash } from "../types";

const JWT_SECRET = "test-secret-userroutes-zod-32chars!!";

function buildAdminToken(): string {
  return jwt.sign(
    { id: 1, email: "admin@example.com", role: Role.ADMIN, tenantIds: [], roleAssignments: [] },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function buildAdminUser(): UserWithPasswordHash {
  return {
    id: 1,
    email: "admin@example.com",
    passwordHash: "ignored-for-this-test",
    role: Role.ADMIN,
    tenantIds: [],
    roleAssignments: [],
  };
}

function buildUserStore(): jest.Mocked<UserStore> {
  return {
    initialize: jest.fn(),
    getAllUsers: jest.fn().mockResolvedValue([]),
    saveUser: jest.fn().mockResolvedValue(undefined),
    getUser: jest.fn().mockResolvedValue(buildAdminUser()),
    getUserById: jest.fn().mockResolvedValue(buildAdminUser()),
    updateUser: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn(),
    hasAtLeastOneAdmin: jest.fn().mockResolvedValue(true),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  } as jest.Mocked<UserStore>;
}

function buildApp(userStore: UserStore): express.Express {
  const app = express();
  app.use(bodyParser.json());
  app.use("/api/users", createUserRoutes(userStore));
  return app;
}

describe("userRoutes — strict syncScopeOverride Zod (#947 P4 fixup)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  it("rejects POST /api/users when syncScopeOverride.areaIds is an empty array", async () => {
    const userStore = buildUserStore();
    const app = buildApp(userStore);

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${buildAdminToken()}`)
      .send({
        email: "newuser@example.com",
        password: "Str0ng!Pass1",
        role: Role.USER,
        tenantIds: ["tenant-1"],
        roleAssignments: [
          {
            tenantId: "tenant-1",
            role: "ENUMERATOR",
            syncScopeOverride: { areaIds: [] },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(userStore.saveUser).not.toHaveBeenCalled();
  });

  it("rejects POST /api/users when syncScopeOverride.entityTypes is an empty array", async () => {
    const userStore = buildUserStore();
    const app = buildApp(userStore);

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${buildAdminToken()}`)
      .send({
        email: "newuser@example.com",
        password: "Str0ng!Pass1",
        role: Role.USER,
        tenantIds: ["tenant-1"],
        roleAssignments: [
          {
            tenantId: "tenant-1",
            role: "ENUMERATOR",
            syncScopeOverride: { entityTypes: [] },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(userStore.saveUser).not.toHaveBeenCalled();
  });

  it("accepts POST /api/users with a non-empty syncScopeOverride", async () => {
    const userStore = buildUserStore();
    const app = buildApp(userStore);

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${buildAdminToken()}`)
      .send({
        email: "newuser@example.com",
        password: "Str0ng!Pass1",
        role: Role.USER,
        tenantIds: ["tenant-1"],
        roleAssignments: [
          {
            tenantId: "tenant-1",
            role: "ENUMERATOR",
            syncScopeOverride: { areaIds: ["A1"], entityTypes: ["individual"] },
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(userStore.saveUser).toHaveBeenCalledTimes(1);
  });

  it("rejects PUT /api/users/:id when syncScopeOverride.areaIds is an empty array", async () => {
    const userStore = buildUserStore();
    const app = buildApp(userStore);

    const res = await request(app)
      .put("/api/users/1")
      .set("Authorization", `Bearer ${buildAdminToken()}`)
      .send({
        email: "admin@example.com",
        role: Role.ADMIN,
        tenantIds: [],
        roleAssignments: [
          {
            tenantId: "tenant-1",
            role: "ENUMERATOR",
            syncScopeOverride: { areaIds: [] },
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(userStore.updateUser).not.toHaveBeenCalled();
  });
});
