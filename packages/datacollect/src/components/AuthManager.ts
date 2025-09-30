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

/**
 * Manages authentication across various providers using pluggable adapters.
 *
 * The AuthManager orchestrates authentication flows, supporting multiple authentication
 * configurations (e.g., Auth0, Keycloak, or a default username/password login). It
 * securely stores tokens and manages user session states.
 *
 * Key features:
 * - **Pluggable Adapters**: Integrates with different authentication providers via adapter pattern.
 * - **Multi-Provider Support**: Allows configuring and using multiple authentication mechanisms simultaneously.
 * - **Token Management**: Handles secure storage, retrieval, and removal of authentication tokens.
 * - **Session Management**: Provides methods to check authentication status and manage logout.
 *
 * Architecture:
 * - Uses the Strategy pattern where each authentication provider (Auth0, Keycloak) is an adapter.
 * - Adapters are dynamically loaded based on the `AuthConfig` provided during initialization.
 * - Leverages `AuthStorageAdapter` for persistent storage of authentication tokens.
 *
 * @example
 * Basic usage with a default login:
 * ```typescript
 * const authManager = new AuthManager(
 *   [{ type: 'default', url: 'http://localhost:3000' }], // Configure default login
 *   'http://localhost:3000',
 *   new IndexedDbAuthStorageAdapter('my-tenant')
 * );
 * await authManager.initialize();
 *
 * // Attempt login
 * await authManager.login({ username: 'user@example.com', password: 'password123' }, 'default');
 * if (await authManager.isAuthenticated()) {
 *   console.log('User is authenticated!');
 * }
 * ```
 *
 * @example
 * Login with an external provider (e.g., Auth0):
 * ```typescript
 * const authManager = new AuthManager(
 *   [{ type: 'auth0', clientId: '...', domain: '...' }], // Configure Auth0
 *   'http://localhost:3000', // Sync server URL, not directly used by Auth0 adapter
 *   new IndexedDbAuthStorageAdapter('my-tenant')
 * );
 * await authManager.initialize();
 *
 * // Initiate Auth0 login flow (redirects to Auth0, then back to callback URL)
 * await authManager.login(null, 'auth0');
 *
 * // In the callback handler:
 * await authManager.handleCallback('auth0');
 * ```
 */
export class AuthManager {
  constructor(
    private configs: AuthConfig[],
    private syncServerUrl: string,
    private authStorage?: AuthStorageAdapter,
  ) {}
  private adapters: Record<string, AuthAdapter> = {};
  private currentUser: { id: string; username?: string } | null = null;

  /**
   * Initializes the AuthManager by instantiating and configuring authentication adapters.
   * Based on the provided `AuthConfig` array, it loads the corresponding authentication
   * adapters (e.g., Auth0, Keycloak) and prepares them for use.
   *
   * @returns A Promise that resolves when all configured adapters are initialized.
   */
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

    if (this.authStorage) {
      const username = await this.authStorage.getUsername();
      if (username) {
        this.currentUser = { id: username, username };
      }
    }
  }

  /**
   * Checks if the user is currently authenticated with any of the configured providers
   * or via the default login mechanism.
   *
   * @returns A Promise that resolves to `true` if authenticated, `false` otherwise.
   * @throws {Error} If `AuthStorageAdapter` is not set when checking default token.
   */
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

  /**
   * Handles user login, either through a specific authentication adapter
   * or using the default username/password login mechanism to the sync server.
   *
   * @param credentials The credentials for login (username/password or token).
   * @param type Optional. The type of authentication provider to use (e.g., 'auth0', 'keycloak', 'default').
   *             If not provided, and `credentials` are `PasswordCredentials`, it defaults to the 'default' login.
   * @returns A Promise that resolves when the login operation is complete.
   * @throws {Error} If `AuthStorageAdapter` is not set or if login fails.
   */
  async login(credentials: PasswordCredentials | TokenCredentials | null, type?: string): Promise<void> {
    if (!this.authStorage) {
      throw new Error("Auth storage is not set");
    }
    if (type) {
      const adapter = this.adapters[type];
      if (!adapter) {
        throw new Error(`Authentication adapter for type ${type} is not initialized`);
      }

      const result = await adapter.login(credentials);

      if (result?.token) {
        await this.authStorage.setToken(type, result.token);
      }
      if (result?.username) {
        await this.authStorage.setUsername(result.username);
      }

      this.currentUser = {
        id: result?.username || type,
        username: result?.username,
      };
    } else if (credentials && "username" in credentials) {
      await this.defaultLogin(credentials);
    }
  }

  /**
   * Handles authentication with the sync server using basic username/password credentials.
   * This is used for the 'default' login type.
   *
   * @param credentials The username and password for authentication.
   * @private
   * @throws {Error} If `AuthStorageAdapter` is not set, credentials are null, or login fails.
   */
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
      if (response.data.userId) {
        this.currentUser = { id: response.data.userId, username: credentials.username };
      } else {
        this.currentUser = { id: credentials.username, username: credentials.username };
      }
      await this.authStorage.setUsername(credentials.username);
      return;
    } catch (error) {
      console.error("Failed to login to sync server using default login");
      throw error;
    }
  }

  /**
   * Logs out the user from all configured authentication adapters and clears all stored tokens.
   *
   * @returns A Promise that resolves when the logout operation is complete.
   */
  async logout(): Promise<void> {
    Object.values(this.adapters).forEach((adapter) => adapter.logout());
    if (this.authStorage) {
      await this.authStorage.removeAllTokens();
    }
    this.currentUser = null;
  }

  /**
   * Validates an authentication token for a specific provider.
   *
   * @param type The type of authentication provider (e.g., 'auth0', 'keycloak').
   * @param token The token string to validate.
   * @returns A Promise that resolves to `true` if the token is valid, `false` otherwise.
   */
  async validateToken(type: string, token: string): Promise<boolean> {
    return this.adapters[type]?.validateToken(token) ?? false;
  }

  getCurrentUser(): { id: string; username?: string } | null {
    return this.currentUser;
  }

  /**
   * Handles the authentication callback for a specific provider.
   * This is typically used in browser environments after a redirect from an OAuth provider.
   *
   * @param type The type of authentication provider (e.g., 'auth0', 'keycloak').
   * @returns A Promise that resolves when the callback is handled.
   */
  async handleCallback(type: string): Promise<void> {
    return this.adapters[type]?.handleCallback();
  }
}
