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

import router from '@/router'
import axios from 'axios'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import get from 'lodash/get'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { getDatabase } from '@/database'
import { AUTH_FIELD_KEYS } from '@/authentication/authUtils'
import { initializeProviders } from '@/authentication/setup'
import { isTokenValid } from '@/authentication/authUtils'
import OIDCAuthService, { AuthResult } from '@/authentication'
import type { TenantAppDocument } from '@/schemas/tenantApp.schema'
import type { Config } from '@/utils/dynamicFormIoUtils'

interface AuthProviderConfig {
  enabled: boolean
  domain?: string
  clientId?: string
  webAppURL?: string
  appCallbackURL?: string
  webAppLogoutURL?: string
  appLogoutURL?: string
  scope?: string
  url?: string
  realm?: string
  custom?: Record<string, unknown>
}

interface AuthConfig {
  auth0?: AuthProviderConfig
  keycloak?: AuthProviderConfig
  [key: string]: AuthProviderConfig | undefined
}

interface ExtendedConfig extends Config {
  authConfig?: AuthConfig
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const tokens = ref<Record<string, string>>({})
  const userIds = ref<Record<string, string>>({})
  const fullSyncServerUrls = ref<Record<string, string>>({})

  // Database instance
  const db = getDatabase()

  // Actions

  const setSyncServerToken = (server: string, newToken: string | null) => {
    tokens.value[server] = newToken
    if (newToken) {
      localStorage.setItem(`syncServerToken_${server}`, newToken)
    } else {
      localStorage.removeItem(`syncServerToken_${server}`)
    }
  }

  const setSyncServerUserId = (server: string, newUserId: string | null) => {
    userIds.value[server] = newUserId
    if (newUserId) {
      localStorage.setItem(`syncServerUserId_${server}`, newUserId)
    } else {
      localStorage.removeItem(`syncServerUserId_${server}`)
    }
  }

  const setFullSyncServerUrl = (server: string, newUrl: string | null) => {
    fullSyncServerUrls.value[server] = newUrl
    if (newUrl) {
      localStorage.setItem(`fullSyncServerUrl_${server}`, newUrl)
    } else {
      localStorage.removeItem(`fullSyncServerUrl_${server}`)
    }
  }

  const loginSyncServer = async (
    server: string,
    credentials: { email: string; password: string }
  ) => {
    let res
    let fullSyncServerUrl
    try {
      // First try with HTTPS
      res = await axios.post('https://' + server + '/api/users/login', {
        email: credentials.email,
        password: credentials.password
      })
      fullSyncServerUrl = 'https://' + server
    } catch (error) {
      console.error('Try HTTPS failed', error)
      // If HTTPS fails, try with HTTP
      res = await axios.post('http://' + server + '/api/users/login', {
        email: credentials.email,
        password: credentials.password
      })
      fullSyncServerUrl = 'http://' + server
    }
    const token = get(res.data, 'token')
    const userId = get(res.data, 'userId')
    setSyncServerToken(server, token)
    setSyncServerUserId(server, userId)
    setFullSyncServerUrl(server, fullSyncServerUrl)
  }

  const logoutSyncServer = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    setSyncServerToken(server, null)
    setSyncServerUserId(server, null)
    setFullSyncServerUrl(server, null)
   
  }

  const getSyncServerAuth = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    let token = tokens.value[server]
    let userId = userIds.value[server]
    let fullSyncServerUrl = fullSyncServerUrls.value[server]

    console.log('getSyncServerAuth', appId, server, token, userId, fullSyncServerUrl)
    if (!token) {
      token = localStorage.getItem(`syncServerToken_${server}`)
      setSyncServerToken(server, token)
    }
    if (!userId) {
      userId = localStorage.getItem(`syncServerUserId_${server}`)
      setSyncServerUserId(server, userId)
    }
    if (!fullSyncServerUrl) {
      fullSyncServerUrl = localStorage.getItem(`fullSyncServerUrl_${server}`)
      setFullSyncServerUrl(server, fullSyncServerUrl)
    }
    return { token, userId, fullSyncServerUrl }
  }

  // OIDC Authentication methods

  const getTenantApp = async (appId: string): Promise<TenantAppDocument | null> => {
    try {
      const tenantApp = await (
        await db
      ).collections.tenantapps
        .findOne({
          selector: {
            id: appId
          }
        })
        .exec()
        .then((result) => {
          return result
        })
      return tenantApp || null
    } catch (error) {
      console.error('Error fetching tenant app:', error)
      return null
    }
  }

  const getOIDCConfig = (tenantApp: TenantAppDocument): AuthConfig | null => {
    const data = tenantApp?._data as ExtendedConfig
    return data?.authConfig || null
  }

  const isAuthConfigured = (oidcConfig: AuthConfig): boolean => {
    return oidcConfig && (oidcConfig.auth0?.enabled || oidcConfig.keycloak?.enabled)
  }

  const isOidcAuthenticated = async (appId: string, redirectPath: string): Promise<boolean> => {
    const tenantApp = await getTenantApp(appId)
    const oidcConfig = getOIDCConfig(tenantApp)
    // No auth config - no authentication required
    if (!oidcConfig) {
      return true
    }

    const provider = localStorage.getItem(`${AUTH_FIELD_KEYS.last_auth_provider}_${appId}`)

    // No provider stored - authentication required if auth is configured
    if (!provider) {
      return !isAuthConfigured(oidcConfig)
    }

    const authServices = {}
    initializeProviders(oidcConfig, null, appId, authServices)

    try {
      const currentUser: AuthResult = await authServices[provider].getStoredAuth()
      const server = await getSyncServerUrlByAppId(appId)
      const hasToken = localStorage.getItem(`syncServerToken_${server}`) || false
      const hasUserId = localStorage.getItem(`syncServerUserId_${server}`) || false
      const isAuthenticated = hasToken && hasUserId && currentUser
      const tokenValid = await isTokenValid(currentUser?.id_token || '')
      if (isAuthenticated && tokenValid) {
        localStorage.setItem(AUTH_FIELD_KEYS.current_app_id, appId)
        return true
      } else if (isAuthConfigured(oidcConfig)) {
        setOidcLoginRedirect(appId, redirectPath)
        return false
      } else {
        return true
      }
    } catch (error) {
      console.error('Error checking OIDC authentication:', error)
      return !isAuthConfigured(oidcConfig)
    }
  }
  const setOidcLoginRedirect = (appId: string, redirectPath: string) => {
    localStorage.setItem(AUTH_FIELD_KEYS.current_app_id, appId)
    localStorage.setItem(AUTH_FIELD_KEYS.auth_redirect_url, redirectPath)
  }
 
  const logoutOIDC = async (appId: string) => {
    const provider = localStorage.getItem(`${AUTH_FIELD_KEYS.last_auth_provider}_${appId}`)
    const tenantApp = await getTenantApp(appId)
    const oidcConfig = getOIDCConfig(tenantApp)
    const authServices: Record<string, OIDCAuthService> = {}
    initializeProviders(oidcConfig, null, appId, authServices)
    await authServices[provider].logout()
    // Clear local storage
    localStorage.removeItem(AUTH_FIELD_KEYS.last_auth_app_id)
    localStorage.removeItem(AUTH_FIELD_KEYS.last_auth_provider)
    localStorage.removeItem(AUTH_FIELD_KEYS.auth_redirect_url)
    localStorage.removeItem(AUTH_FIELD_KEYS.last_auth_app_id)
    router.push({ name: 'home', replace: true })

  }
  return {
    getSyncServerAuth,
    loginSyncServer,
    logoutSyncServer,
    isOidcAuthenticated,
    logoutOIDC
  }
})
