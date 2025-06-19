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

import { AUTH_FIELD_KEYS } from './authUtils'
import { WebStorageStateStore, UserManager, UserManagerSettings } from 'oidc-client-ts'

export interface OIDCConfig {
  authority: string
  client_id: string
  redirect_uri: string
  post_logout_redirect_uri: string
  response_type: string
  scope: string
  state?: string
  custom?: Record<string, string>
}

export interface AuthResult {
  access_token: string
  id_token?: string
  refresh_token?: string
  expires_in: number
  profile?: any // Optional profile information
}

export interface AuthSetupOptions {
  onAuthSuccess?: (result: AuthResult) => void
  onAuthError?: (error: Error) => void
}

export class OIDCAuthService {
  private storage = localStorage
  private userManager: UserManager

  constructor(config: OIDCConfig) {
    const settings: UserManagerSettings = {
      authority: config.authority,
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      post_logout_redirect_uri: config.post_logout_redirect_uri,
      response_type: config.response_type,
      scope: config.scope,
      userStore: new WebStorageStateStore({ store: localStorage }),
      extraQueryParams: {
        ...config.custom // Allow custom parameters to be passed
      }
      // Additional settings as needed
    }
    this.userManager = new UserManager(settings)
  }

  async login(): Promise<void> {
    try {
      await this.userManager.signinRedirect()
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`)
    }
  }

  async handleCallback(): Promise<AuthResult> {
    try {
      const user = await this.userManager.signinRedirectCallback()
      if (user) {
        return {
          access_token: user.access_token,
          id_token: user.id_token,
          refresh_token: user.refresh_token,
          expires_in: user.expires_in
        }
      } else {
        throw new Error('No user found after callback')
      }
    } catch (error) {
      throw new Error(`Callback handling failed: ${error.message}`)
    }
  }

  async logout(): Promise<void> {
    try {
      await this.userManager.signoutRedirectCallback()
      await this.userManager.removeUser()
      const appId = this.storage.getItem(AUTH_FIELD_KEYS.current_app_id)
      // Clear storage items
      this.storage.removeItem(AUTH_FIELD_KEYS.last_auth_app_id)
      this.storage.removeItem(AUTH_FIELD_KEYS.last_auth_provider)
      this.storage.removeItem(AUTH_FIELD_KEYS.auth_redirect_url)
      this.storage.removeItem(`${AUTH_FIELD_KEYS.last_auth_provider}_${appId}`)
    } catch (error) {
      throw new Error(`Logout failed: ${error.message}`)
    }
  }

  async getStoredAuth(): Promise<AuthResult | null> {
    try {
      const user = await this.userManager.getUser()
      if (user) {
        return {
          access_token: user.access_token,
          id_token: user.id_token,
          refresh_token: user.refresh_token,
          expires_in: user.expires_in,
          profile: user.profile || {}
        }
      }
      return null
    } catch (error) {
      console.error('Error getting stored auth:', error)
      return null
    }
  }
}

export default OIDCAuthService
