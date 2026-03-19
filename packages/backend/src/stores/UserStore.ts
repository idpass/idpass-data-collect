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

import { Pool } from "pg";
import { eq, count, sql } from "drizzle-orm";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Role, RoleAssignment, User, UserStore, UserWithPasswordHash } from "../types";
import { createLogger } from "../utils/logger";
import { users } from "../db/schema";

const log = createLogger("UserStore");

type DrizzleDb = NodePgDatabase<Record<string, never>>;

export class UserStoreImpl implements UserStore {
  private pool: Pool;
  private db: DrizzleDb;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
    this.db = drizzle(this.pool);
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          tenant_ids TEXT[] NOT NULL DEFAULT '{}',
          role_assignments JSONB DEFAULT '[]'
        )
      `);
      // Add tenant_ids column to existing tables that were created before this migration
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_ids TEXT[] NOT NULL DEFAULT '{}'
      `);
      // Add role_assignments column to existing tables that were created before this migration
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role_assignments JSONB DEFAULT '[]'
      `);
    } finally {
      client.release();
    }
  }

  async saveUser(user: Omit<UserWithPasswordHash, "id">): Promise<void> {
    const { email, passwordHash, role, tenantIds = [], roleAssignments = [] } = user;
    const result = await this.db
      .insert(users)
      .values({
        email,
        passwordHash,
        role,
        tenantIds,
        roleAssignments,
      })
      .returning({ id: users.id });

    const userId = result[0].id;
    log.info({ userId }, "New user created");
  }

  async getUser(emailParam: string): Promise<UserWithPasswordHash | null> {
    const result = await this.db.select().from(users).where(eq(users.email, emailParam));

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      role: Role[row.role as keyof typeof Role] as Role,
      tenantIds: row.tenantIds ?? [],
      roleAssignments: (row.roleAssignments as RoleAssignment[]) ?? [],
    };
  }

  async updateUser(user: UserWithPasswordHash): Promise<void> {
    const { id, passwordHash, role, tenantIds = [], roleAssignments = [] } = user;
    await this.db
      .update(users)
      .set({
        passwordHash,
        role,
        tenantIds,
        roleAssignments,
      })
      .where(eq(users.id, id));
  }

  async deleteUser(email: string): Promise<void> {
    await this.db.delete(users).where(eq(users.email, email));
  }

  async clearStore(): Promise<void> {
    await this.db.execute(sql`TRUNCATE TABLE users`);
  }

  async hasAtLeastOneAdmin(): Promise<boolean> {
    const result = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, Role.ADMIN));

    return result[0].value > 0;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        tenantIds: users.tenantIds,
        roleAssignments: users.roleAssignments,
      })
      .from(users);

    return result.map((row) => ({
      id: row.id,
      email: row.email,
      role: Role[row.role as keyof typeof Role],
      tenantIds: row.tenantIds ?? [],
      roleAssignments: (row.roleAssignments as RoleAssignment[]) ?? [],
    }));
  }

  async getUserById(id: number): Promise<UserWithPasswordHash | null> {
    const result = await this.db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
        tenantIds: users.tenantIds,
        roleAssignments: users.roleAssignments,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      passwordHash: row.passwordHash,
      email: row.email,
      role: Role[row.role as keyof typeof Role],
      tenantIds: row.tenantIds ?? [],
      roleAssignments: (row.roleAssignments as RoleAssignment[]) ?? [],
    };
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
