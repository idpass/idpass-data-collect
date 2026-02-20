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

import "dotenv/config";
import { run } from "./syncServer";

const {
  SYNC_SERVER_PORT: port = "3000",
  USER_ID: userId = "SYNC_SERVER",
  ADMIN_PASSWORD: adminPassword,
  ADMIN_EMAIL: adminEmail,
  POSTGRES: postgresUrl,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
} = process.env;

if (!adminPassword || !adminEmail) {
  throw new Error("Initial admin credentials must be set");
}

if (!jwtSecret) {
  throw new Error("JWT_SECRET must be set");
}

if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// Use POSTGRES if set, otherwise fallback to DATABASE_URL (Railway's default)
const postgresConnectionString = postgresUrl || databaseUrl;

if (!postgresConnectionString) {
  throw new Error("PostgreSQL connection string must be set via POSTGRES or DATABASE_URL environment variable");
}

import { createLogger } from "./utils/logger";
const log = createLogger("index");

const serverInstance = run({
  port: parseInt(port),
  adminPassword,
  adminEmail,
  userId,
  postgresUrl: postgresConnectionString,
});

async function shutdown(signal: string) {
  log.info({ signal }, "Received shutdown signal, closing connections");
  try {
    const instance = await serverInstance;
    await instance.closeConnection();
    log.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, "Error during graceful shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
