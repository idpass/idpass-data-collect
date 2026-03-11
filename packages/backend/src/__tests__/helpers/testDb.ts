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
 * Shared test helpers for PostgreSQL database setup.
 *
 * Centralises the boilerplate that every backend integration test needs:
 *   - deriving a per-suite connection string so tests run in isolated databases
 *   - ensuring the target database exists before the suite starts
 *   - conditionally skipping suites when POSTGRES_TEST is not set
 */

import { Client } from "pg";

/**
 * Build a connection string for a test suite by appending a unique suffix
 * to the database name found in `process.env.POSTGRES_TEST`.
 *
 * @param suffix - A short, unique identifier for the test suite
 *                 (e.g. `"sec_auth"`, `"sync_server"`).
 * @returns The derived connection string, or `""` when POSTGRES_TEST is unset.
 */
export const getConnectionString = (suffix: string): string => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_${suffix}` : `datacollect_${suffix}`;
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

/**
 * Ensure the database referenced by `connectionString` exists.
 *
 * Connects to the default `postgres` database, checks `pg_database`,
 * and issues `CREATE DATABASE` when the target is missing.
 */
export const ensureDatabaseExists = async (connectionString: string): Promise<void> => {
  if (!connectionString) return;
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    // Connection failed (wrong credentials, server not running, etc.) — treat
    // the same as POSTGRES_TEST being unset so callers can skip gracefully.
    throw new Error(`Cannot connect to PostgreSQL for test setup: ${(err as Error).message}`);
  }
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (result.rowCount === 0) {
      const escapedName = dbName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${escapedName}"`);
    }
  } finally {
    await client.end().catch(() => {});
  }
};

/**
 * A `describe` wrapper that skips the entire suite when `POSTGRES_TEST`
 * is not set in the environment.
 */
export const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;
