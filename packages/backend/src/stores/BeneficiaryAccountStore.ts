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
import {
  BeneficiaryAccount,
  BeneficiaryAccountStore,
  CreateBeneficiaryAccountInput,
} from "../types/portal";

function mapRowToAccount(row: Record<string, unknown>): BeneficiaryAccount {
  return {
    id: row.id as number,
    appConfigId: row.app_config_id as string,
    keycloakSubject: row.keycloak_subject as string,
    email: (row.email as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    registrantSystem: (row.registrant_system as string | null) ?? null,
    registrantValue: (row.registrant_value as string | null) ?? null,
    consentAcceptedAt: row.consent_accepted_at ? new Date(row.consent_accepted_at as string) : null,
    linkedAt: row.linked_at ? new Date(row.linked_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class BeneficiaryAccountStoreImpl implements BeneficiaryAccountStore {
  private pool: Pool;

  constructor(connectionStringOrPool: string | Pool) {
    this.pool = typeof connectionStringOrPool === "string"
      ? new Pool({ connectionString: connectionStringOrPool })
      : connectionStringOrPool;
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS beneficiary_accounts (
          id SERIAL PRIMARY KEY,
          app_config_id TEXT NOT NULL,
          keycloak_subject TEXT NOT NULL,
          email TEXT,
          display_name TEXT,
          registrant_system TEXT,
          registrant_value TEXT,
          consent_accepted_at TIMESTAMPTZ,
          linked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(app_config_id, keycloak_subject)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_beneficiary_registrant
          ON beneficiary_accounts(registrant_system, registrant_value)
      `);
    } finally {
      client.release();
    }
  }

  async findByKeycloakSubject(appConfigId: string, keycloakSubject: string): Promise<BeneficiaryAccount | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM beneficiary_accounts WHERE app_config_id = $1 AND keycloak_subject = $2 LIMIT 1",
        values: [appConfigId, keycloakSubject],
      });
      if (rows.length === 0) {
        return null;
      }
      return mapRowToAccount(rows[0]);
    } finally {
      client.release();
    }
  }

  async findById(id: number): Promise<BeneficiaryAccount | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: "SELECT * FROM beneficiary_accounts WHERE id = $1 LIMIT 1",
        values: [id],
      });
      if (rows.length === 0) {
        return null;
      }
      return mapRowToAccount(rows[0]);
    } finally {
      client.release();
    }
  }

  async create(input: CreateBeneficiaryAccountInput): Promise<BeneficiaryAccount> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query({
        text: `
          INSERT INTO beneficiary_accounts
            (app_config_id, keycloak_subject, email, display_name)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        values: [
          input.appConfigId,
          input.keycloakSubject,
          input.email ?? null,
          input.displayName ?? null,
        ],
      });
      return mapRowToAccount(rows[0]);
    } finally {
      client.release();
    }
  }

  async updateConsent(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: `
          UPDATE beneficiary_accounts
          SET consent_accepted_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        values: [id],
      });
    } finally {
      client.release();
    }
  }

  async linkRegistrant(id: number, registrantSystem: string, registrantValue: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: `
          UPDATE beneficiary_accounts
          SET registrant_system = $2,
              registrant_value = $3,
              linked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        values: [id, registrantSystem, registrantValue],
      });
    } finally {
      client.release();
    }
  }

  async unlinkRegistrant(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: `
          UPDATE beneficiary_accounts
          SET registrant_system = NULL,
              registrant_value = NULL,
              linked_at = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        values: [id],
      });
    } finally {
      client.release();
    }
  }

  async delete(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query({
        text: "DELETE FROM beneficiary_accounts WHERE id = $1",
        values: [id],
      });
    } finally {
      client.release();
    }
  }

  async clearStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("TRUNCATE TABLE beneficiary_accounts");
    } finally {
      client.release();
    }
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
