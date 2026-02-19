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

const log = createLogger("OtpAuthAdapter");

/**
 * Authentication adapter that uses one-time passwords (OTP) sent to
 * a phone number or email address. Designed for self-service access
 * by beneficiaries who may not have traditional login credentials.
 *
 * Flow:
 * 1. Call requestOtp(identifier) to send a 6-digit code
 * 2. Call verifyOtp(identifier, otp) to exchange the code for a JWT
 * 3. The JWT has scope "self-service" and is scoped to the beneficiary's entity
 */
export class OtpAuthAdapter implements AuthAdapter {
  private serverUrl: string;

  constructor(
    private storage: SingleAuthStorage | null,
    private config: AuthConfig,
  ) {
    this.serverUrl = config.fields.serverUrl || "";
  }

  /** Request OTP to be sent to phone/email */
  async requestOtp(identifier: string): Promise<{ success: boolean; expiresIn: number }> {
    try {
      const response = await axios.post(`${this.serverUrl}/api/auth/otp/request`, {
        identifier,
      });
      return {
        success: response.data.success ?? false,
        expiresIn: response.data.expiresIn ?? 0,
      };
    } catch (error) {
      log.error({ err: error }, "Failed to request OTP");
      return { success: false, expiresIn: 0 };
    }
  }

  /** Verify OTP and get token */
  async verifyOtp(
    identifier: string,
    otp: string,
  ): Promise<{ username: string; token: string }> {
    try {
      const response = await axios.post(`${this.serverUrl}/api/auth/otp/verify`, {
        identifier,
        otp,
      });
      const { username, token } = response.data;

      if (this.storage && token) {
        await this.storage.setToken(token);
      }

      return { username, token };
    } catch (error) {
      log.error({ err: error }, "OTP verification failed");
      throw new Error("OTP verification failed");
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
    // No initialization needed for OTP adapter
  }

  async login(
    _credentials: PasswordCredentials | TokenCredentials | null,
  ): Promise<{ username: string; token: string }> {
    throw new Error("Use requestOtp() and verifyOtp() for OTP authentication");
  }

  async handleCallback(): Promise<void> {
    // No callback handling needed for OTP flow
  }
}
