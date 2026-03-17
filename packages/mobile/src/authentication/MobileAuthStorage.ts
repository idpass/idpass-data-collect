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

import { SecureStorageService } from '@/services/SecureStorageService'

/**
 * Mobile storage adapter for AuthManager that uses native secure storage.
 * Implements the AuthStorageAdapter interface from idpass-data-collect.
 * Supports app-specific and provider-specific token storage with OAuth flow management.
 *
 * On native platforms, all values are stored in iOS Keychain / Android Keystore
 * via SecureStorageService. On web/dev, falls back to localStorage.
 */
export class MobileAuthStorage {
  private readonly TOKEN_KEY_PREFIX = 'auth_token'
  private readonly PROVIDER_KEY_PREFIX = 'last_provider'
  private readonly TEMP_OAUTH_APP_ID_KEY = 'temp_oauth_app_id'
  private readonly TEMP_OAUTH_PROVIDER_KEY = 'temp_oauth_provider'

  constructor(private appId?: string) {}

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

  private getProviderKey(appId?: string): string {
    const currentAppId = appId || this.appId
    return currentAppId ? `${currentAppId}_${this.PROVIDER_KEY_PREFIX}` : this.PROVIDER_KEY_PREFIX
  }

  async getToken(provider?: string, appId?: string): Promise<string> {
    const key = this.getTokenKey(provider, appId)
    return (await SecureStorageService.get(key)) || ''
  }

  async setToken(token: string, provider?: string, appId?: string): Promise<void> {
    const key = this.getTokenKey(provider, appId)
    await SecureStorageService.set(key, token)
  }

  async removeToken(provider?: string, appId?: string): Promise<void> {
    const key = this.getTokenKey(provider, appId)
    await SecureStorageService.remove(key)
  }

  async saveTemporaryOAuthData(appId: string, provider: string): Promise<void> {
    await SecureStorageService.set(this.TEMP_OAUTH_APP_ID_KEY, appId)
    await SecureStorageService.set(this.TEMP_OAUTH_PROVIDER_KEY, provider)
  }

  async getTemporaryOAuthData(): Promise<{ appId: string | null; provider: string | null }> {
    try {
      return {
        appId: await SecureStorageService.get(this.TEMP_OAUTH_APP_ID_KEY),
        provider: await SecureStorageService.get(this.TEMP_OAUTH_PROVIDER_KEY)
      }
    } catch {
      console.warn('Failed to get temporary OAuth data')
      return { appId: null, provider: null }
    }
  }

  async clearTemporaryOAuthData(): Promise<void> {
    try {
      await SecureStorageService.remove(this.TEMP_OAUTH_APP_ID_KEY)
      await SecureStorageService.remove(this.TEMP_OAUTH_PROVIDER_KEY)
    } catch {
      console.warn('Failed to clear temporary OAuth data')
    }
  }

  async getLastProvider(appId?: string): Promise<string | null> {
    const currentAppId = appId || this.appId
    if (!currentAppId) return null

    try {
      return await SecureStorageService.get(this.getProviderKey(currentAppId))
    } catch {
      console.warn('Failed to get last provider')
      return null
    }
  }

  async setLastProvider(provider: string, appId?: string): Promise<void> {
    const currentAppId = appId || this.appId
    if (!currentAppId) return

    try {
      await SecureStorageService.set(this.getProviderKey(currentAppId), provider)
    } catch {
      console.warn('Failed to set last provider')
    }
  }

  async clearLastProvider(appId?: string): Promise<void> {
    const currentAppId = appId || this.appId
    if (!currentAppId) return

    try {
      await SecureStorageService.remove(this.getProviderKey(currentAppId))
    } catch {
      console.warn('Failed to clear last provider')
    }
  }
}
