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
 * Security: login does not leak account existence via timing.
 *
 * The handler must run a password hash comparison even when the email is
 * unknown, so the response time does not reveal whether an account is
 * registered (user enumeration).
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import request from "supertest";
import { run } from "../syncServer";
import { SyncServerInstance } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return { createLogger: () => silentLogger.child({ component: "test" }), logger: silentLogger };
});

const postgresUrl = getConnectionString("login_timing");
const ADMIN_EMAIL = "admin-login-timing@example.com";
const ADMIN_PW = "AdminLogin123!";

describeIfPostgres("Login timing (user enumeration)", () => {
  let app: SyncServerInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = "login-timing-test-secret-32-characters-ok";
    await ensureDatabaseExists(postgresUrl);
    app = await run({ port: 0, adminPassword: ADMIN_PW, adminEmail: ADMIN_EMAIL, postgresUrl });
  });

  afterAll(async () => {
    await app.clearStore();
    await app.closeConnection();
  });

  it("runs a password hash comparison even when the email is unknown", async () => {
    const spy = jest.spyOn(bcrypt, "compare");
    spy.mockClear();

    const res = await request(app.httpServer)
      .post("/api/users/login")
      .send({ email: "ghost@nowhere.test", password: "WhateverPass1!" });

    expect(res.status).toBe(401);
    // Without the fix, an unknown email returns before bcrypt.compare is reached;
    // the constant-time path compares against a placeholder hash instead.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
