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

import {
  AuthConfig,
  AuthAdapter,
  PasswordCredentials,
  TokenCredentials,
  AuthStorageAdapter,
} from "../interfaces/types";
import { MockAuthAdapter } from "../services/MockAuthAdapter";

const adaptersMapping = {
  "mock-auth-adapter": MockAuthAdapter,
};

export class AuthManager {
  constructor(
    private configs: AuthConfig[],
    private authStorage: AuthStorageAdapter,
  ) {}
  private adapters: Record<string, AuthAdapter> = {};

  async initialize(): Promise<void> {
    this.adapters = this.configs.reduce(
      (acc, config) => {
        const adapterModule = adaptersMapping[config.type as keyof typeof adaptersMapping];
        if (adapterModule) {
          acc[config.type] = new adapterModule(this.authStorage);
        }
        return acc;
      },
      {} as Record<string, AuthAdapter>,
    );
  }

  async isAuthenticated(): Promise<boolean> {
    return Object.values(this.adapters).some((adapter) => adapter.isAuthenticated());
  }

  async login(type: string, credentials: PasswordCredentials | TokenCredentials | null): Promise<void> {
    this.adapters[type]?.login(credentials);
  }

  async logout(): Promise<void> {
    Object.values(this.adapters).forEach((adapter) => adapter.logout());
  }

  async validateToken(type: string, token: string): Promise<boolean> {
    return this.adapters[type]?.validateToken(token) ?? false;
  }
}
