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
import { Session, SessionStore } from "../types";

export class SessionStoreImpl implements SessionStore {
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
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          entity_guid TEXT NOT NULL,
          expired_date TIMESTAMP NOT NULL
        )
      `;
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async createSession(session: Session): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { token, entityGuid, expiredDate } = session;
      const query = {
        text: "INSERT INTO sessions (token, entity_guid, expired_date) VALUES ($1, $2, $3)",
        values: [token, entityGuid, expiredDate],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async getSession(token: string): Promise<Session | null> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT * FROM sessions WHERE token = $1",
        values: [token],
      };

      const { rows } = await client.query(query);
      if (rows.length === 0) {
        return null;
      }

      const { token: sessionToken, entity_guid, expired_date } = rows[0];
      return {
        token: sessionToken,
        entityGuid: entity_guid,
        expiredDate: expired_date,
      };
    } finally {
      client.release();
    }
  }

  async deleteSession(token: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "DELETE FROM sessions WHERE token = $1",
        values: [token],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = "TRUNCATE TABLE sessions";
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
