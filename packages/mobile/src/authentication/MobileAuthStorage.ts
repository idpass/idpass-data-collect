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

/**
 * Mobile storage adapter for AuthManager that uses localStorage
 * Implements the AuthStorageAdapter interface from idpass-data-collect
 * Supports app-specific and provider-specific token storage with OAuth flow management
 */
export class MobileAuthStorage {
  private readonly TOKEN_KEY_PREFIX = 'auth_token'
  private readonly PROVIDER_KEY_PREFIX = 'last_provider'
  //use for temporary oauth data between login and callback
  private readonly TEMP_OAUTH_APP_ID_KEY = 'temp_oauth_app_id'
  private readonly TEMP_OAUTH_PROVIDER_KEY = 'temp_oauth_provider'

  constructor(private appId?: string) {}

  // Generate token key with app ID and provider
  private getTokenKey(provider?: string, appId?: string): string {
    const currentAppId = appId || this.appId
    let key = this.TOKEN_KEY_PREFIX

    if (currentAppId) {
      key += `_app_${currentAppId}`
    }

    if (provider) {
      key += `_${provider}`
    }

    return key
  }

  // Generate provider key with app ID
  private getProviderKey(appId?: string): string {
    const currentAppId = appId || this.appId
    return currentAppId ? `${currentAppId}_${this.PROVIDER_KEY_PREFIX}` : this.PROVIDER_KEY_PREFIX
  }

  async getToken(provider?: string, appId?: string): Promise<string> {
    const key = this.getTokenKey(provider, appId)
    return localStorage.getItem(key) || ''
  }

  async setToken(token: string, provider?: string, appId?: string): Promise<void> {
    const key = this.getTokenKey(provider, appId)
    localStorage.setItem(key, token)
  }

  async removeToken(provider?: string, appId?: string): Promise<void> {
    const key = this.getTokenKey(provider, appId)
    localStorage.removeItem(key)
  }

  // OAuth flow management methods
  /**
   * Save app ID and provider temporarily for OAuth flow
   */
  saveTemporaryOAuthData(appId: string, provider: string): void {
    try {
      localStorage.setItem(this.TEMP_OAUTH_APP_ID_KEY, appId)
      localStorage.setItem(this.TEMP_OAUTH_PROVIDER_KEY, provider)
      console.log('Temporary OAuth data saved:', { appId, provider })
    } catch (err) {
      console.warn('Failed to save temporary OAuth data:', err)
    }
  }

  /**
   * Retrieve temporary OAuth data from localStorage
   */
  getTemporaryOAuthData(): { appId: string | null; provider: string | null } {
    try {
      return {
        appId: localStorage.getItem(this.TEMP_OAUTH_APP_ID_KEY),
        provider: localStorage.getItem(this.TEMP_OAUTH_PROVIDER_KEY)
      }
    } catch (err) {
      console.warn('Failed to get temporary OAuth data:', err)
      return { appId: null, provider: null }
    }
  }

  /**
   * Clear temporary OAuth data from localStorage
   */
  clearTemporaryOAuthData(): void {
    try {
      localStorage.removeItem(this.TEMP_OAUTH_APP_ID_KEY)
      localStorage.removeItem(this.TEMP_OAUTH_PROVIDER_KEY)
      console.log('Temporary OAuth data cleared')
    } catch (err) {
      console.warn('Failed to clear temporary OAuth data:', err)
    }
  }

  // Provider tracking methods
  /**
   * Get the last used provider for an app
   */
  getLastProvider(appId?: string): string | null {
    const currentAppId = appId || this.appId
    if (!currentAppId) return null

    try {
      return localStorage.getItem(this.getProviderKey(currentAppId))
    } catch (err) {
      console.warn('Failed to get last provider:', err)
      return null
    }
  }

  /**
   * Set the last used provider for an app
   */
  setLastProvider(provider: string, appId?: string): void {
    const currentAppId = appId || this.appId
    if (!currentAppId) return

    try {
      localStorage.setItem(this.getProviderKey(currentAppId), provider)
    } catch (err) {
      console.warn('Failed to set last provider:', err)
    }
  }

  /**
   * Clear the last used provider for an app
   */
  clearLastProvider(appId?: string): void {
    const currentAppId = appId || this.appId
    if (!currentAppId) return

    try {
      localStorage.removeItem(this.getProviderKey(currentAppId))
    } catch (err) {
      console.warn('Failed to clear last provider:', err)
    }
  }
}
