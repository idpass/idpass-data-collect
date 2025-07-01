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

import { AuthResult, OIDCConfig } from '../../interfaces/types'
import { WebStorageStateStore, UserManager, UserManagerSettings } from 'oidc-client-ts'
import { IndexedDBStore } from './IndexedDBStore'

// Mock storage for server environments
class MockStorage implements Storage {
  private data: Record<string, string> = {};
  
  get length(): number {
    return Object.keys(this.data).length;
  }
  
  clear(): void {
    this.data = {};
  }
  
  getItem(key: string): string | null {
    return this.data[key] || null;
  }
  
  key(index: number): string | null {
    const keys = Object.keys(this.data);
    return keys[index] || null;
  }
  
  removeItem(key: string): void {
    delete this.data[key];
  }
  
  setItem(key: string, value: string): void {
    this.data[key] = value;
  }
}

/**
 * OpenID Connect (OIDC) Authentication Manager
 * 
 * Manages OIDC authentication flows including login, logout, token handling,
 * and callback processing using the oidc-client-ts library.
 * 
 * @example
 * ```typescript
 * const config: OIDCConfig = {
 *   authority: "https://auth.example.com",
 *   client_id: "my-app",
 *   redirect_uri: "https://myapp.com/callback",
 *   post_logout_redirect_uri: "https://myapp.com/logout",
 *   response_type: "code",
 *   scope: "openid profile email"
 * };
 * 
 * const authManager = new OIDCAuthManager(config);
 * await authManager.login();
 * ```
 */
export class OIDCClient {
  /** OIDC client user manager for handling authentication flows */
  private userManager: UserManager

  /**
   * Initialize the OIDC Authentication Manager with configuration.
   * 
   * @param config - OIDC configuration containing provider settings
   */
  constructor(config: OIDCConfig) {
    // Use IndexedDB if available (browser), otherwise use mock storage (server)
    const indexedDBStore = new IndexedDBStore()
    const storage = typeof window !== 'undefined' && window.indexedDB 
      ? { 
          getItem: (key: string) => indexedDBStore.getItemAsync(key),
          setItem: (key: string, value: string) => indexedDBStore.setItemAsync(key, value),
          removeItem: (key: string) => indexedDBStore.removeItemAsync(key),
          // Implement remaining AsyncStorage interface methods
          get length() { return Promise.resolve(0) },
          clear: () => Promise.resolve(),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          key: (_index: number) => Promise.resolve(null)
        }
      : new MockStorage()
    
    const settings: UserManagerSettings = {
      authority: config.authority,
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      post_logout_redirect_uri: config.post_logout_redirect_uri,
      response_type: config.response_type,
      scope: config.scope,
      userStore: new WebStorageStateStore({ store: storage }),
      extraQueryParams: {
        ...config.extraQueryParams // Allow custom parameters to be passed
      }
    }
    this.userManager = new UserManager(settings)
  }

  /**
   * Initiate the OIDC login flow by redirecting to the authorization server.
   * 
   * This method redirects the user to the OIDC provider's authorization endpoint.
   * After successful authentication, the user will be redirected back to the
   * configured redirect_uri.
   * 
   * @throws {Error} If the redirect fails or OIDC provider is unreachable
   */
  async login(): Promise<void> {
    await this.userManager.signinRedirect()
  }

  /**
   * Handle the callback from the OIDC provider after authentication.
   * 
   * This method should be called on the redirect_uri page to process the
   * authorization response and extract tokens from the callback URL.
   * 
   * @returns Promise resolving to AuthResult containing tokens and user info
   * @throws {Error} If callback processing fails or no user is found
   */
  async handleCallback(): Promise<AuthResult> {
    try {
      const user = await this.userManager.signinRedirectCallback()
      if (user) {
        return {
          access_token: user.access_token,
          id_token: user.id_token,
          refresh_token: user.refresh_token,
          expires_in: user.expires_in ?? 0
        }
      } else {
        throw new Error('No user found after callback')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      throw new Error(`Callback handling failed: ${errorMessage}`)
    }
  }

  /**
   * Logout the current user and clear authentication state.
   * 
   * Performs OIDC logout by redirecting to the provider's logout endpoint
   * and clears all stored authentication data from local storage.
   * 
   * @throws {Error} If logout process fails
   */
  async logout(): Promise<void> {
    await this.userManager.signoutRedirectCallback()
    await this.userManager.removeUser()
  }

  /**
   * Retrieve stored authentication information from local storage.
   * 
   * Checks for existing valid authentication tokens and user information
   * that were previously stored during a successful login.
   * 
   * @returns Promise resolving to AuthResult if valid tokens exist, null otherwise
   * @throws {Error} If there's an error accessing stored authentication data
   */
  async getStoredAuth(): Promise<AuthResult | null> {
    const user = await this.userManager.getUser()
    if (user) {
      return {
        access_token: user.access_token,
        id_token: user.id_token,
        refresh_token: user.refresh_token,
        expires_in: user.expires_in ?? 0,
        profile: user.profile as Record<string, string>
      }
    }
    return null
  }
}

export default OIDCClient
