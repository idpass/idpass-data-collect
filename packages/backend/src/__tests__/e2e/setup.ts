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
 * Shared setup for backend e2e tests.
 *
 * Provides helpers to boot a real server instance backed by PostgreSQL,
 * authenticate, and tear down cleanly between tests.
 */

import "dotenv/config";
import request from "supertest";
import { run } from "../../syncServer";
import { SyncServerInstance, AppConfig } from "../../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "../helpers/testDb";

const ADMIN_EMAIL = "e2e-admin@test.lan";
const ADMIN_PASSWORD = "e2e-admin-password-42!";

const postgresUrl = getConnectionString("e2e");

/** A minimal valid app config for e2e tests. */
const testAppConfig: AppConfig = {
  id: "e2e-test-config",
  artifactId: "e2e-test-artifact",
  name: "E2E Test Config",
  description: "Config used by e2e test suite",
  version: "1.0.0",
  entityForms: [
    {
      id: "e2e-form",
      title: "E2E Form",
      formio: { components: [] },
      name: "E2E Form",
      dependsOn: "",
    },
  ],
};

interface TestContext {
  app: SyncServerInstance;
  adminToken: string;
}

/**
 * Boot a fresh server, create the admin, and obtain a JWT token.
 * Caller is responsible for calling `teardown()` afterwards.
 */
async function setup(): Promise<TestContext> {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "e2e-test-secret-that-is-at-least-32-chars!!";
  }
  await ensureDatabaseExists(postgresUrl);

  const app = await run({
    port: 0,
    adminPassword: ADMIN_PASSWORD,
    adminEmail: ADMIN_EMAIL,
    postgresUrl,
  });

  // Obtain admin JWT
  const loginRes = await request(app.httpServer)
    .post("/api/users/login")
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  const adminToken: string = loginRes.body.token;

  return { app, adminToken };
}

async function teardown(ctx: TestContext | undefined) {
  if (!ctx?.app) return;
  await ctx.app.clearStore();
  await ctx.app.closeConnection();
}

export {
  setup,
  teardown,
  postgresUrl,
  describeIfPostgres,
  testAppConfig,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
};
