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
import { Role, User, UserStore, UserWithPasswordHash } from "../types";

export class UserStoreImpl implements UserStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `;
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async saveUser(user: Omit<UserWithPasswordHash, "id">): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { email, passwordHash, role } = user;
      const query = {
        text: "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
        values: [email, passwordHash, role],
      };

      const { rows } = await client.query(query);
      const userId = rows[0].id;
      console.log(`New user created with id: ${userId}`);
    } finally {
      client.release();
    }
  }

  async getUser(emailParam: string): Promise<UserWithPasswordHash | null> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT * FROM users WHERE email = $1",
        values: [emailParam],
      };

      const { rows } = await client.query(query);
      if (rows.length === 0) {
        return null;
      }

      const { id, email, password_hash, role } = rows[0];
      return { id, email, passwordHash: password_hash, role: Role[role as keyof typeof Role] as Role };
    } finally {
      client.release();
    }
  }

  async updateUser(user: UserWithPasswordHash): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { id, email, passwordHash, role } = user;
      const query = {
        text: "UPDATE users SET password_hash = $3, role = $4 WHERE id = $1 AND email = $2",
        values: [id, email, passwordHash, role],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async deleteUser(email: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "DELETE FROM users WHERE email = $1",
        values: [email],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = "TRUNCATE TABLE users";
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async hasAtLeastOneAdmin(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT COUNT(*) FROM users WHERE role = $1",
        values: [Role.ADMIN],
      };

      const { rows } = await client.query(query);
      const count = parseInt(rows[0].count, 10);
      return count > 0;
    } finally {
      client.release();
    }
  }

  async getAllUsers(): Promise<User[]> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT id, email, password_hash, role FROM users",
      };

      const { rows } = await client.query(query);
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: Role[row.role as keyof typeof Role],
      }));
    } finally {
      client.release();
    }
  }

  async getUserById(id: number): Promise<UserWithPasswordHash | null> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT id, email, password_hash, role FROM users WHERE id = $1 LIMIT 1",
        values: [id],
      };

      const { rows } = await client.query(query);
      return rows.map((row) => ({
        id: row.id,
        passwordHash: row.password_hash,
        email: row.email,
        role: Role[row.role as keyof typeof Role],
      }))[0];
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
