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

import path from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createLogger } from "../utils/logger";

const log = createLogger("db:migrate");

/**
 * Runs Drizzle-managed migrations from the `drizzle/` directory.
 *
 * This is intended for use with `drizzle-kit generate` produced migration
 * files. For the initial schema the runtime uses `initializeDatabase()` from
 * `./initialize.ts` which runs raw DDL. Once the project fully transitions
 * to Drizzle-managed migrations, this function can replace `initializeDatabase()`.
 *
 * @param postgresUrl PostgreSQL connection string.
 */
export async function runMigrations(postgresUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: postgresUrl });
  const db = drizzle(pool);

  try {
    log.info("Running database migrations");
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    log.info("Database migrations completed");
  } finally {
    await pool.end();
  }
}

/**
 * CLI entry point: run migrations using the POSTGRES env variable.
 *
 * Usage:
 *   ts-node src/db/migrate.ts
 *   node dist/db/migrate.js
 */
if (require.main === module) {
  const postgresUrl = process.env.POSTGRES;
  if (!postgresUrl) {
    console.error("POSTGRES environment variable is required");
    process.exit(1);
  }
  runMigrations(postgresUrl)
    .then(() => {
      console.log("Migrations completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
