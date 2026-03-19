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

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createActor } from 'xstate'
import { authMachine } from '@/machines/authMachine'
import { MobileAuthStorage } from '@/authentication/MobileAuthStorage'
import { detectPlatform } from '@/utils/device'
import { useTenantStore } from '@/store/tenant'
import { App } from '@capacitor/app'
import { AppLockService } from '@/services/AppLockService'

export const useAuthManagerStore = defineStore('authManager', () => {
  const actor = createActor(authMachine)
  actor.start()

  // Reactive snapshot kept in sync via subscription
  const snapshot = ref(actor.getSnapshot())
  actor.subscribe((snap) => {
    snapshot.value = snap
  })

  // ── Computed selectors (replace 9 independent refs) ──────────────

  const isLoading = computed(() =>
    snapshot.value.matches('initializing') ||
    snapshot.value.matches({ unauthenticated: 'loggingIn' }) ||
    snapshot.value.matches({ unauthenticated: 'handlingCallback' }) ||
    snapshot.value.matches({ unauthenticated: 'handlingDefaultLogin' }) ||
    snapshot.value.matches('loggingOut')
  )

  const isInitialized = computed(() =>
    !snapshot.value.matches('idle') && !snapshot.value.matches('error')
  )

  const isAuthenticated = computed(() =>
    snapshot.value.matches('authenticated')
  )

  const error = computed(() => snapshot.value.context.error)

  const currentProvider = computed(() => snapshot.value.context.currentProvider)

  const availableProviders = computed(() => snapshot.value.context.availableProviders)

  const appId = computed(() => snapshot.value.context.appId)

  const authManager = computed(() => snapshot.value.context.authManager)

  const mobileAuthStorage = computed(() => snapshot.value.context.mobileAuthStorage)

  // ── Actions → event dispatchers ──────────────────────────────────

  async function initialize(targetAppId: string) {
    actor.send({ type: 'INITIALIZE', appId: targetAppId })
    await waitForState((s) =>
      !s.matches('initializing')
    )
    // Throw on error to preserve existing API contract
    const snap = actor.getSnapshot()
    if (snap.matches('error')) {
      throw new Error(snap.context.error || 'Failed to initialize auth system')
    }
  }

  async function login(
    provider: string | null,
    credentials?: { username: string; password: string } | { token: string }
  ) {
    const snap = actor.getSnapshot()
    if (!snap.matches('unauthenticated') && !snap.matches('authenticated')) {
      throw new Error('Auth system not initialized. Call initialize() first.')
    }
    actor.send({ type: 'LOGIN', provider, credentials })
    await waitForState((s) =>
      !s.matches({ unauthenticated: 'loggingIn' })
    )
    const snap2 = actor.getSnapshot()
    if (!snap2.matches('authenticated')) {
      throw new Error(snap2.context.error || `Login failed for ${provider}`)
    }
  }

  async function logout(targetAppId: string) {
    actor.send({ type: 'LOGOUT', appId: targetAppId })
    // Cross-machine coordination: lock on logout
    AppLockService.lock()
    await waitForState((s) =>
      !s.matches('loggingOut')
    )
    const snap = actor.getSnapshot()
    if (snap.matches('authenticated') && snap.context.error) {
      throw new Error(snap.context.error)
    }
  }

  async function handleCallback() {
    const currentSnap = actor.getSnapshot()
    if (!currentSnap.matches('unauthenticated') && !currentSnap.matches('authenticated')) {
      throw new Error('Auth system not initialized. Call initialize() first.')
    }
    actor.send({ type: 'HANDLE_CALLBACK' })
    await waitForState((s) =>
      !s.matches({ unauthenticated: 'handlingCallback' })
    )
    const resultSnap = actor.getSnapshot()
    if (!resultSnap.matches('authenticated')) {
      throw new Error(resultSnap.context.error || 'Callback handling failed')
    }
  }

  async function handleDefaultLogin() {
    actor.send({ type: 'HANDLE_DEFAULT_LOGIN' })
    await waitForState((s) =>
      !s.matches({ unauthenticated: 'handlingDefaultLogin' }) &&
      !s.matches({ authenticated: 'handlingDefaultLogin' })
    )
  }

  async function refreshAuthenticationState() {
    actor.send({ type: 'REFRESH' })
    await waitForState((s) =>
      !s.matches({ authenticated: 'refreshing' }) &&
      !s.matches({ unauthenticated: 'refreshing' })
    )
  }

  async function getTemporaryOAuthData() {
    const storage = mobileAuthStorage.value
    if (!storage) {
      const tempStorage = new MobileAuthStorage()
      return tempStorage.getTemporaryOAuthData()
    }
    return storage.getTemporaryOAuthData()
  }

  async function checkAuthenticationStatus(targetAppId: string) {
    try {
      const tenantStore = useTenantStore()
      const tenant = await tenantStore.getTenant(targetAppId)

      if (!tenant || !tenant._data.authConfigs) {
        return {
          isAuthenticated: false,
          error: 'No tenant or auth configuration found'
        }
      }

      const platform = detectPlatform()

      await initialize(targetAppId)
      const isAppAuthenticated = authManager.value
        ? await authManager.value.isAuthenticated()
        : false

      if (isAppAuthenticated) {
        return {
          isAuthenticated: isAppAuthenticated,
          currentProvider: currentProvider.value,
          authManager: authManager.value,
          authStorage: mobileAuthStorage.value,
          tenant,
          platform
        }
      }

      return {
        isAuthenticated: false,
        authManager: authManager.value,
        authStorage: mobileAuthStorage.value,
        tenant,
        platform
      }
    } catch (err) {
      console.error('Authentication check failed:', err)
      return {
        isAuthenticated: false,
        error: err instanceof Error ? err.message : 'Authentication check failed'
      }
    }
  }

  async function setupCapacitorUrlListener() {
    const platform = detectPlatform()

    if (platform !== 'mobile') return

    try {
      App.addListener('appUrlOpen', async (_event) => {
        try {
          await handleCallback()

          if (isAuthenticated.value && typeof window !== 'undefined') {
            const redirectUrl = appId.value ? `/app/${appId.value}` : '/'
            window.location.href = redirectUrl
          }
        } catch (callbackError) {
          console.error('Failed to handle OAuth callback:', callbackError)
        }
      })

      console.log('Capacitor URL listener set up successfully')
    } catch (setupError) {
      console.warn('Could not set up Capacitor URL listener:', setupError)
    }
  }

  function $reset() {
    actor.send({ type: 'RESET' })
  }

  // ── Helper ───────────────────────────────────────────────────────

  function waitForState(
    predicate: (snap: ReturnType<typeof actor.getSnapshot>) => boolean
  ): Promise<void> {
    return new Promise((resolve) => {
      if (predicate(actor.getSnapshot())) {
        resolve()
        return
      }
      const sub = actor.subscribe((snap) => {
        if (predicate(snap)) {
          sub.unsubscribe()
          resolve()
        }
      })
    })
  }

  return {
    // State (computed — preserves existing API)
    authManager,
    mobileAuthStorage,
    isLoading,
    error,
    isInitialized,
    isAuthenticated,
    currentProvider,
    availableProviders,
    appId,

    // Actions
    initialize,
    login,
    logout,
    handleCallback,
    handleDefaultLogin,
    refreshAuthenticationState,
    checkAuthenticationStatus,
    setupCapacitorUrlListener,
    getTemporaryOAuthData,
    $reset
  }
})
