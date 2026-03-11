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

import { fromPromise } from 'xstate'
import { MobileAuthStorage } from '@/authentication/MobileAuthStorage'
import { useTenantStore } from '@/store/tenant'
import { initStore, store } from '@/store'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import type { InitializeResult, LoginResult, CallbackResult, DefaultLoginResult, RefreshResult, AuthContext } from '../types'

interface AuthConfig {
  type: 'auth0' | 'keycloak'
  fields: Record<string, string>
}

export const initializeAuth = fromPromise<InitializeResult, { appId: string }>(async ({ input }) => {
  const { appId } = input
  const mobileAuthStorage = new MobileAuthStorage(appId)
  const tenantStore = useTenantStore()
  const tenant = await tenantStore.getTenant(appId)

  const authConfigs: AuthConfig[] = tenant._data.authConfigs || []
  const syncServerUrl = await getSyncServerUrlByAppId(appId || 'default')
  await initStore(appId || 'default', syncServerUrl, authConfigs)

  const authManager = store
  const availableProviders = authConfigs.map((config) => config.type)
  const isAuthenticated = await store.isAuthenticated()
  const currentProvider =
    (await mobileAuthStorage.getLastProvider(appId)) || availableProviders[0] || null

  return {
    authManager,
    mobileAuthStorage,
    isAuthenticated,
    currentProvider,
    availableProviders
  }
})

export const performLogin = fromPromise<LoginResult, {
  context: AuthContext
  provider: string | null
  credentials?: { username: string; password: string } | { token: string }
}>(async ({ input }) => {
  const { context, provider, credentials } = input
  const { authManager, mobileAuthStorage, appId } = context

  if (!authManager || !mobileAuthStorage) {
    throw new Error('Auth system not initialized. Call initialize() first.')
  }

  if (appId) {
    await mobileAuthStorage.saveTemporaryOAuthData(appId, provider)
  }

  try {
    await authManager.login(credentials || null, provider)
    return { success: true }
  } catch (err) {
    // Clean up temporary OAuth data on login failure
    await mobileAuthStorage.clearTemporaryOAuthData()
    throw err
  }
})

export const processOAuthCallback = fromPromise<CallbackResult, { context: AuthContext }>(async ({ input }) => {
  const { context } = input
  const { authManager, mobileAuthStorage, appId } = context

  if (!authManager || !mobileAuthStorage) {
    throw new Error('Auth system not initialized. Call initialize() first.')
  }

  const { provider } = await mobileAuthStorage.getTemporaryOAuthData()
  if (!provider) {
    throw new Error('No provider available for callback handling')
  }

  await authManager.handleCallback(provider)
  await mobileAuthStorage.setLastProvider(provider, appId || undefined)

  // Refresh auth state after callback
  await authManager.isAuthenticated()
  await mobileAuthStorage.clearTemporaryOAuthData()

  return { provider }
})

export const handleDefaultLogin = fromPromise<DefaultLoginResult, { context: AuthContext }>(async ({ input }) => {
  const { context } = input
  const { mobileAuthStorage, appId } = context

  const isAuthenticated = !!context.authManager && await context.authManager.isAuthenticated()
  if (isAuthenticated && typeof window !== 'undefined') {
    await mobileAuthStorage.setLastProvider('default', appId || undefined)
    const redirectUrl = appId ? `/app/${appId}` : '/'
    window.location.href = redirectUrl
  }
  return { isAuthenticated }
})

export const refreshAuthState = fromPromise<RefreshResult, { context: AuthContext }>(async ({ input }) => {
  const { context } = input
  const { authManager, mobileAuthStorage, appId } = context

  if (!authManager) {
    return { isAuthenticated: false, currentProvider: null }
  }

  const authResult = await authManager.isAuthenticated()
  if (authResult) {
    const provider = context.currentProvider ||
      (await mobileAuthStorage?.getLastProvider(appId || undefined)) || null
    return { isAuthenticated: true, currentProvider: provider }
  }
  return { isAuthenticated: false, currentProvider: null }
})

export const performLogout = fromPromise<void, { context: AuthContext; appId: string }>(async ({ input }) => {
  const { context, appId } = input
  const { authManager, mobileAuthStorage } = context

  if (!authManager) return

  await authManager.logout()
  if (mobileAuthStorage) {
    await mobileAuthStorage.clearLastProvider(appId || undefined)
  }
})
