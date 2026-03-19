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

import axios from "axios";
import {
  AuthAdapter,
  AuthConfig,
  PasswordCredentials,
  SingleAuthStorage,
  TokenCredentials,
} from "../../interfaces/types";
import { createLogger } from "../../utils/logger";

const log = createLogger("IdAuthAdapter");

/**
 * Authentication adapter that verifies beneficiaries using their
 * national ID combined with date of birth, or via QR code data.
 * Designed for self-service scenarios where beneficiaries authenticate
 * using identity documents rather than credentials.
 *
 * Flows:
 * - authenticateWithId(nationalId, dateOfBirth, tenantId): Verify using ID document
 * - authenticateWithQr(qrData): Verify using scanned QR code
 *
 * Both flows return a JWT with scope "self-service" scoped to the matched entity.
 */
export class IdAuthAdapter implements AuthAdapter {
  private serverUrl: string;

  constructor(
    private storage: SingleAuthStorage | null,
    private config: AuthConfig,
  ) {
    this.serverUrl = config.fields.serverUrl || "";
  }

  /** Authenticate with national ID + date of birth */
  async authenticateWithId(
    nationalId: string,
    dateOfBirth: string,
    tenantId: string,
  ): Promise<{ username: string; token: string }> {
    try {
      const response = await axios.post(`${this.serverUrl}/api/auth/id/verify`, {
        nationalId,
        dateOfBirth,
        tenantId,
      });
      const { username, token } = response.data;

      if (this.storage && token) {
        await this.storage.setToken(token);
      }

      return { username, token };
    } catch (error) {
      log.error({ err: error }, "ID verification failed");
      throw new Error("ID verification failed");
    }
  }

  /** Authenticate with QR code data */
  async authenticateWithQr(
    qrData: string,
  ): Promise<{ username: string; token: string }> {
    try {
      const response = await axios.post(`${this.serverUrl}/api/auth/qr/verify`, {
        qrData,
      });
      const { username, token } = response.data;

      if (this.storage && token) {
        await this.storage.setToken(token);
      }

      return { username, token };
    } catch (error) {
      log.error({ err: error }, "QR authentication failed");
      throw new Error("QR authentication failed");
    }
  }

  /** Check if currently authenticated */
  async isAuthenticated(): Promise<boolean> {
    if (!this.storage) {
      return false;
    }
    const token = await this.storage.getToken();
    if (!token) {
      return false;
    }
    return this.validateToken(token);
  }

  /** Validate stored token */
  async validateToken(token: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.serverUrl}/api/users/check-token`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return true;
    } catch (error) {
      log.error({ err: error }, "Token validation failed");
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.storage) {
      await this.storage.removeToken();
    }
  }

  async initialize(): Promise<void> {
    // No initialization needed for ID adapter
  }

  async login(
    _credentials: PasswordCredentials | TokenCredentials | null,
  ): Promise<{ username: string; token: string }> {
    throw new Error(
      "Use authenticateWithId() or authenticateWithQr() for ID-based authentication",
    );
  }

  async handleCallback(): Promise<void> {
    // No callback handling needed for ID-based flow
  }
}
