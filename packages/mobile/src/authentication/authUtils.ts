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

import { OIDCAuthService } from './index'

import { Ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { jwtDecode } from 'jwt-decode'
export const AUTH_FIELD_KEYS = {
  last_auth_provider: 'last_auth_provider',
  last_auth_app_id: 'last_auth_app_id',
  current_app_id: 'current_app_id',
  auth_redirect_url: 'auth_redirect_url',
  auth_state: 'auth_state'
}

// Handle login for a specific provider
export const handleLogin = async (
  provider: string,
  service: OIDCAuthService,
  appId: string,
  redirectUrl: string,
  loadingStates?: Ref<Record<string, boolean>>
) => {
  try {
    if (!appId) {
      throw new Error('No app ID available for authentication')
    }

    // Store state in localStorage
    localStorage.setItem(AUTH_FIELD_KEYS.current_app_id, appId)
    localStorage.setItem(AUTH_FIELD_KEYS.last_auth_provider, provider)
    // Store redirect URL
    localStorage.setItem(AUTH_FIELD_KEYS.auth_redirect_url, redirectUrl)
    localStorage.setItem(AUTH_FIELD_KEYS.last_auth_app_id, appId)
    await service.login()
    return true
  } catch (error) {
    console.error('Login error:', error)
    if (loadingStates?.value) {
      loadingStates.value[provider] = false
    }
    throw error
  }
}

export const getRedirectUri = (webUrl: string, appScheme: string): string => {
  return Capacitor.isNativePlatform() ? `${appScheme}` : `${webUrl}`
}

export const getPostLogoutUri = (webUrl: string, appScheme: string): string => {
  return Capacitor.isNativePlatform() ? `${appScheme}` : `${webUrl}`
}
export const isTokenValid = (token: string): boolean => {
  try {
    const decodedToken = jwtDecode(token)
    const currentTime = Date.now() / 1000
    return decodedToken.exp > currentTime
  } catch (error) {
    console.error('Token validation error:', error)
    return false
  }
}
