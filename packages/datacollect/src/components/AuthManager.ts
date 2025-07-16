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
  AuthConfig,
  AuthAdapter,
  AuthStorageAdapter,
  PasswordCredentials,
  TokenCredentials,
  SingleAuthStorage,
} from "../interfaces/types";
import { SingleAuthStorageImpl } from "../services/SingleAuthStorageImpl";
import { KeycloakAuthAdapter } from "./authentication/KeycloakAuthAdapter";
import { Auth0AuthAdapter } from "./authentication/Auth0AuthAdapter";

const adaptersMapping = {
  auth0: Auth0AuthAdapter,
  keycloak: KeycloakAuthAdapter,
};

export class AuthManager {
  constructor(
    private configs: AuthConfig[],
    private syncServerUrl: string,
    private authStorage?: AuthStorageAdapter,
  ) {}
  private adapters: Record<string, AuthAdapter> = {};

  async initialize(): Promise<void> {
    this.adapters = this.configs.reduce(
      (acc, config) => {
        try {
          const adapterModule = adaptersMapping[config.type as keyof typeof adaptersMapping];
          let singleAuthStorage: SingleAuthStorage | null = null;
          if (this.authStorage) {
            singleAuthStorage = new SingleAuthStorageImpl(this.authStorage, config.type);
          }
          if (adapterModule) {
            acc[config.type] = new adapterModule(singleAuthStorage, config);
          }
        } catch (error) {
          console.error(`Failed to initialize adapter for type ${config.type}:`, error);
          // Skip this adapter but continue with others
        }
        return acc;
      },
      {} as Record<string, AuthAdapter>,
    );
  }

  async getAvailableAuthProviders(): Promise<string[]> {
    return Object.keys(this.adapters);
  }

  async isAuthenticated(): Promise<boolean> {
    // If there are no configs and no auth storage, return false
    if (!this.configs.length) {
      return false;
    }
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    // Check adapter-based authentication
    const adapterResults = await Promise.all(Object.values(this.adapters).map((adapter) => adapter.isAuthenticated()));

    // Check default login token if auth storage exists
    if (this.authStorage) {
      const defaultToken = await this.authStorage.getTokenByProvider("default");
      const hasDefaultToken = !!defaultToken;
      return adapterResults.some((result) => result) || hasDefaultToken;
    }

    return adapterResults.some((result) => result);
  }

  async login(credentials: PasswordCredentials | TokenCredentials | null, type?: string): Promise<void> {
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    if (type) {
      this.adapters[type]?.login(credentials);
    } else if (credentials && "username" in credentials) {
      await this.defaultLogin(credentials);
    }
  }

  private async defaultLogin(credentials: PasswordCredentials): Promise<void> {
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    if (!credentials) {
      throw new Error("Unauthorized");
    }

    try {
      // Ensure syncServerUrl has a proper protocol
      let url = this.syncServerUrl;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `http://${url}`;
      }

      const response = await axios.post(`${url}/api/users/login`, {
        email: credentials.username,
        password: credentials.password,
      });
      const token = response.data.token;
      await this.authStorage.setToken("default", token);
      return;
    } catch (error) {
      console.error("Failed to login to sync server using default login");
      throw error;
    }
  }

  async logout(): Promise<void> {
    Object.values(this.adapters).forEach((adapter) => adapter.logout());
    if (this.authStorage) {
      await this.authStorage.removeAllTokens();
    }
  }

  async validateToken(type: string, token: string): Promise<boolean> {
    return this.adapters[type]?.validateToken(token) ?? false;
  }

  async handleCallback(type: string): Promise<void> {
    return this.adapters[type]?.handleCallback();
  }

  async createUser(type: string, user: { email: string; guid: string; phoneNumber?: string }): Promise<void> {
    return this.adapters[type]?.createUser(user);
  }
  async getUserInfo(token: string, type?: string): Promise<Record<string, unknown> | null> {
    // Try each adapter until one succeeds
    if (type) {
      return this.adapters[type]?.getUserInfo(token);
    }

    for (const [type, adapter] of Object.entries(this.adapters)) {
      try {
        const userInfo = await adapter.getUserInfo(token);
        if (userInfo) {
          console.log(`Successfully got user info from ${type}:`, userInfo);
          return userInfo;
        }
      } catch (error) {
        console.log(`Failed to get user info from ${type}:`, error);
        // Continue to next adapter
      }
    }
    return null;
  }

  async getUserEmailOrPhoneNumber(
    type: string,
    token: string,
  ): Promise<{ email: string; phoneNumber?: string } | null> {
    return this.adapters[type]?.getUserEmailOrPhoneNumber(token);
  }
}
