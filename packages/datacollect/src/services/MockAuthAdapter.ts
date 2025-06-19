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

import { AuthAdapter, AuthStorageAdapter } from "../interfaces/types";

export class MockAuthAdapter implements AuthAdapter {
  private authenticated = false;

  constructor(private AuthStorage: AuthStorageAdapter) {}

  async initialize(): Promise<void> {
    const token = await this.AuthStorage.getToken();
    if (token) {
      this.authenticated = true;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return Promise.resolve(this.authenticated);
  }

  async login(): Promise<void> {
    this.authenticated = true;
    await this.AuthStorage.setToken("mock-token");
    return Promise.resolve();
  }

  async logout(): Promise<void> {
    this.authenticated = false;
    await this.AuthStorage.removeToken();
    return Promise.resolve();
  }

  async validateToken(token: string): Promise<boolean> {
    return Promise.resolve(this.authenticated && token === "mock-token");
  }
}
