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

import { AuthAdapter, AuthConfig, SingleAuthStorage } from "../interfaces/types";

export class MockAuthAdapter implements AuthAdapter {
  private authenticated = false;

  constructor(
    private authStorage?: SingleAuthStorage,
    public config?: AuthConfig,
  ) {}

  async initialize(): Promise<void> {
    if (this.authStorage) {
      const token = await this.authStorage.getToken();
      if (token) {
        this.authenticated = true;
      }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return Promise.resolve(this.authenticated);
  }

  async login(): Promise<{ username: string; token: string }> {
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    this.authenticated = true;
    await this.authStorage.setToken("mock-token");
    return Promise.resolve({ username: "mock-username", token: "mock-token" });
  }

  async logout(): Promise<void> {
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    this.authenticated = false;
    await this.authStorage.removeToken();
    return Promise.resolve();
  }

  async validateToken(token: string): Promise<boolean> {
    return Promise.resolve(this.authenticated && token === "mock-token");
  }

  async handleCallback(): Promise<void> {
    return Promise.resolve();
  }

  async getUserInfo(token?: string): Promise<Record<string, unknown> | null> {
    if (!this.authenticated && token !== "mock-token") {
      return null;
    }
    
    return Promise.resolve({
      sub: "mock-user-id",
      name: "Mock User",
      email: "mock@example.com",
      email_verified: true,
    });
  }

  async createUser(user: { email: string; phoneNumber?: string }): Promise<void> {
    console.log("Creating user", user);
    return Promise.resolve();
  }

  async getUserEmailOrPhoneNumber(): Promise<{ email: string; phoneNumber?: string }> {
    return Promise.resolve({ email: "mock-email@example.com", phoneNumber: "mock-phone-number" });
  }
}
