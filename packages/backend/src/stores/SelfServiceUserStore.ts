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
import { SelfServiceUser, SelfServiceUserStore } from "../types";

export class SelfServiceUserStoreImpl implements SelfServiceUserStore {
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
        CREATE TABLE IF NOT EXISTS self_service_users (
          id SERIAL PRIMARY KEY,
          guid TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          config_id TEXT NOT NULL,
          registered_auth_providers TEXT[] DEFAULT '{}',
          UNIQUE(config_id, guid)
        )
      `;
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async saveUser(configId: string, guid: string, email: string, phone?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "INSERT INTO self_service_users (config_id, guid, email, phone) VALUES ($1, $2, $3, $4) ON CONFLICT (config_id, guid) DO UPDATE SET email = $3, phone = $4 RETURNING id",
        values: [configId, guid, email, phone],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async getUser(configId: string, guid: string): Promise<SelfServiceUser | null> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "SELECT * FROM self_service_users WHERE config_id = $1 AND guid = $2",
        values: [configId, guid],
      };

      const { rows } = await client.query(query);
      if (rows.length === 0) {
        return null;
      }

      const { id, guid: userGuid, email, phone, config_id, registered_auth_providers } = rows[0];
      return {
        id,
        guid: userGuid,
        email,
        phone,
        configId: config_id,
        registeredAuthProviders: registered_auth_providers || [],
      };
    } finally {
      client.release();
    }
  }

  async addRegisteredAuthProviders(configId: string, guid: string, registeredAuthProviders: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      // For each auth provider, add it to the array if it doesn't already exist
      for (const provider of registeredAuthProviders) {
        const query = {
          text: `
            UPDATE self_service_users 
            SET registered_auth_providers = CASE 
              WHEN $3 = ANY(registered_auth_providers) THEN registered_auth_providers
              ELSE registered_auth_providers || $3
            END
            WHERE config_id = $1 AND guid = $2
          `,
          values: [configId, guid, provider],
        };
        await client.query(query);
      }
    } finally {
      client.release();
    }
  }

  async removeRegisteredAuthProviders(
    configId: string,
    guid: string,
    registeredAuthProviders: string[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // For each auth provider, remove it from the array
      for (const provider of registeredAuthProviders) {
        const query = {
          text: `
            UPDATE self_service_users 
            SET registered_auth_providers = array_remove(registered_auth_providers, $3)
            WHERE config_id = $1 AND guid = $2
          `,
          values: [configId, guid, provider],
        };
        await client.query(query);
      }
    } finally {
      client.release();
    }
  }

  async deleteUser(configId: string, guid: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = {
        text: "DELETE FROM self_service_users WHERE config_id = $1 AND guid = $2",
        values: [configId, guid],
      };

      await client.query(query);
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = "TRUNCATE TABLE self_service_users";
      await client.query(query);
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
