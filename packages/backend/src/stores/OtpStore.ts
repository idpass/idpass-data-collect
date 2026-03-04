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
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { createLogger } from "../utils/logger";
import { withClient } from "../utils/db";

const log = createLogger("OtpStore");

/** Maximum number of verification attempts before the code is invalidated */
const MAX_ATTEMPTS = 3;
/** OTP expiry duration in seconds */
const OTP_EXPIRY_SECONDS = 300; // 5 minutes
/** Length of the generated OTP code */
const OTP_CODE_LENGTH = 6;

export interface OtpCode {
  id: string;
  identifier: string;
  code: string;
  tenantId: string;
  entityGuid: string | null;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  createdAt: Date;
}

export interface OtpStore {
  initialize(): Promise<void>;
  createOtp(identifier: string, tenantId: string, entityGuid?: string): Promise<OtpCode>;
  verifyOtp(identifier: string, code: string, tenantId: string): Promise<OtpCode | null>;
  getActiveCodesByIdentifier(identifier: string, tenantId: string): Promise<OtpCode[]>;
  incrementAttempts(id: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export class OtpStoreImpl implements OtpStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await withClient(this.pool, async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS otp_codes (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          code TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          entity_guid TEXT,
          expires_at TIMESTAMP NOT NULL,
          attempts INTEGER DEFAULT 0,
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_otp_codes_identifier_tenant
        ON otp_codes (identifier, tenant_id)
      `);
    });
    log.info("OTP store initialized");
  }

  /**
   * Generate a cryptographically random 6-digit OTP code.
   */
  private generateOtpCode(): string {
    const bytes = crypto.randomBytes(4);
    const number = bytes.readUInt32BE(0) % 1_000_000;
    return number.toString().padStart(OTP_CODE_LENGTH, "0");
  }

  /**
   * Hash an OTP code using SHA-256 so plaintext codes are not stored in the database.
   */
  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /**
   * Compare an input code against a stored hash using constant-time comparison
   * to prevent timing side-channel attacks.
   */
  private verifyCodeHash(inputCode: string, storedHash: string): boolean {
    const inputHash = this.hashCode(inputCode);
    const inputBuf = Buffer.from(inputHash, "utf8");
    const storedBuf = Buffer.from(storedHash, "utf8");
    if (inputBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(inputBuf, storedBuf);
  }

  async createOtp(
    identifier: string,
    tenantId: string,
    entityGuid?: string,
  ): Promise<OtpCode> {
    const id = uuidv4();
    const code = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

    const hashedCode = this.hashCode(code);

    await withClient(this.pool, async (client) => {
      // Wrap invalidation + insert in a transaction so both succeed or fail
      // together. Without this, a crash between the UPDATE and INSERT would
      // leave the user with no valid code (denial of service).
      await client.query("BEGIN");
      try {
        // Invalidate all existing active codes for this identifier/tenant
        // before creating a new one. This prevents code accumulation and
        // ensures only the most recent code is valid.
        await client.query(
          `UPDATE otp_codes SET verified = true
           WHERE identifier = $1 AND tenant_id = $2 AND verified = false AND expires_at > NOW()`,
          [identifier, tenantId],
        );

        await client.query(
          `INSERT INTO otp_codes (id, identifier, code, tenant_id, entity_guid, expires_at, attempts, verified)
           VALUES ($1, $2, $3, $4, $5, $6, 0, false)`,
          [id, identifier, hashedCode, tenantId, entityGuid || null, expiresAt],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    log.info({ tenantId }, "OTP code created");

    // Return the plaintext code so it can be sent to the user (e.g. via SMS).
    // The database stores only the hashed version.
    return {
      id,
      identifier,
      code,
      tenantId,
      entityGuid: entityGuid || null,
      expiresAt,
      attempts: 0,
      verified: false,
      createdAt: new Date(),
    };
  }

  async verifyOtp(
    identifier: string,
    code: string,
    tenantId: string,
  ): Promise<OtpCode | null> {
    return withClient(this.pool, async (client) => {
      await client.query("BEGIN");
      try {
        // Lock the most recent active code with FOR UPDATE SKIP LOCKED
        // to prevent concurrent verification of the same code.
        const result = await client.query(
          `SELECT id, identifier, code, tenant_id, entity_guid, expires_at, attempts, verified, created_at
           FROM otp_codes
           WHERE identifier = $1
             AND tenant_id = $2
             AND verified = false
             AND attempts < $3
             AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [identifier, tenantId, MAX_ATTEMPTS],
        );

        if (result.rows.length === 0) {
          await client.query("ROLLBACK");
          return null;
        }

        const row = result.rows[0];

        // Constant-time comparison of the input code against the stored hash
        if (!this.verifyCodeHash(code, row.code)) {
          // Increment attempts atomically within the same transaction
          await client.query(
            `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
            [row.id],
          );
          await client.query("COMMIT");
          return null;
        }

        // Mark as verified atomically within the same transaction
        await client.query(
          `UPDATE otp_codes SET verified = true WHERE id = $1`,
          [row.id],
        );
        await client.query("COMMIT");

        return {
          id: row.id,
          identifier: row.identifier,
          code: row.code,
          tenantId: row.tenant_id,
          entityGuid: row.entity_guid,
          expiresAt: row.expires_at,
          attempts: row.attempts,
          verified: true,
          createdAt: row.created_at,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async getActiveCodesByIdentifier(
    identifier: string,
    tenantId: string,
  ): Promise<OtpCode[]> {
    return withClient(this.pool, async (client) => {
      const result = await client.query(
        `SELECT id, identifier, code, tenant_id, entity_guid, expires_at, attempts, verified, created_at
         FROM otp_codes
         WHERE identifier = $1
           AND tenant_id = $2
           AND verified = false
           AND attempts < $3
           AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [identifier, tenantId, MAX_ATTEMPTS],
      );

      return result.rows.map((row) => ({
        id: row.id,
        identifier: row.identifier,
        code: row.code,
        tenantId: row.tenant_id,
        entityGuid: row.entity_guid,
        expiresAt: row.expires_at,
        attempts: row.attempts,
        verified: row.verified,
        createdAt: row.created_at,
      }));
    });
  }

  async incrementAttempts(id: string): Promise<void> {
    await withClient(this.pool, (client) =>
      client.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [id]),
    );
  }

  async markVerified(id: string): Promise<void> {
    await withClient(this.pool, (client) =>
      client.query(`UPDATE otp_codes SET verified = true WHERE id = $1`, [id]),
    );
  }

  async clearStore(): Promise<void> {
    await withClient(this.pool, (client) => client.query(`DELETE FROM otp_codes`));
  }

  async closeConnection(): Promise<void> {
    await this.pool.end();
  }
}
