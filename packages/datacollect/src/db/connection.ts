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

import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";
import * as schema from "./schema";

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

/**
 * Creates a Drizzle ORM instance from a pg Pool.
 *
 * @param pool An existing pg Pool instance to use for connections.
 * @returns A Drizzle database instance with the schema applied.
 */
export function createDrizzleFromPool(pool: Pool): DrizzleDatabase {
  return drizzle(pool, { schema });
}

/**
 * Creates a Drizzle ORM instance from a connection string.
 *
 * @param connectionString PostgreSQL connection string.
 * @returns An object containing the Drizzle database instance and the underlying Pool.
 */
export function createDrizzle(connectionString: string): { db: DrizzleDatabase; pool: Pool } {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Acquires a client from the pool, executes the callback, and releases the client.
 */
export async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
