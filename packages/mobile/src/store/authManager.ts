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
import { ref } from 'vue'
import { MobileAuthStorage } from '@/authentication/MobileAuthStorage'

import { detectPlatform } from '@/utils/device'
import { transformAuthConfigs } from '@/utils/authConfigUtils'
import { useTenantStore } from '@/store/tenant'
import { App } from '@capacitor/app'

import { initStore, store } from '@/store'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { EntityDataManager } from 'idpass-data-collect'
// Auth configuration for different providers
interface AuthConfig {
  type: 'auth0' | 'keycloak'
  fields: Record<string, string>
}

export const useAuthManagerStore = defineStore('authManager', () => {
  // State
  const authManager = ref<EntityDataManager | null>(null)
  const mobileAuthStorage = ref<MobileAuthStorage | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isInitialized = ref(false)
  
  // Authentication state
  const isAuthenticated = ref(false)
  const currentProvider = ref<string | null>(null)
  const availableProviders = ref<string[]>([])
  const appId = ref<string | null>(null)

  // Getters
  // Actions
  async function initialize(targetAppId: string) {
    try {
      isLoading.value = true
      error.value = null
      // Initialize storage with app ID
      mobileAuthStorage.value = new MobileAuthStorage(targetAppId)
      appId.value = targetAppId || null
      const tenantStore = useTenantStore()
      const tenant = await tenantStore.getTenant(targetAppId)
      const authConfigs:AuthConfig[] = tenant._data.authConfigs || []
      const transformedAuthConfigs = transformAuthConfigs(authConfigs, detectPlatform())
      // Get sync server URL and initialize the store properly
      const syncServerUrl = await getSyncServerUrlByAppId(targetAppId || 'default')
      await initStore(targetAppId || 'default', syncServerUrl, transformedAuthConfigs)
      
      // Now store is properly initialized, assign it to authManager
      authManager.value = store
      availableProviders.value = authConfigs.map((config) => config.type)  
      isAuthenticated.value = await store.isAuthenticated()
      currentProvider.value = mobileAuthStorage.value.getLastProvider(targetAppId) || availableProviders.value[0] || null
      isInitialized.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize auth system'
      console.error('Auth initialization error:', err)
      isInitialized.value = false
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function login(
    provider: string,
    credentials?: { username: string; password: string } | { token: string }
  ) {
  
    if (!isInitialized.value || !mobileAuthStorage.value || !authManager.value) {
      throw new Error('Auth system not initialized. Call initialize() first.')
    }

    if (!availableProviders.value.includes(provider)) {
      throw new Error(
        `Provider '${provider}' not configured. Available providers: ${availableProviders.value.join(', ')}`
      )
    }

    try {
      isLoading.value = true
      error.value = null

      // Save app ID temporarily for callback processing
      if (appId.value) {
        mobileAuthStorage.value.saveTemporaryOAuthData(appId.value, provider)
      }
      
      // Set current provider before login for callback handling
      currentProvider.value = provider

      // Use the properly initialized authManager (which is the store)
      await authManager.value.login(credentials || null, provider)

      // Update authentication state
      isAuthenticated.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : `Login failed for ${provider}`
      console.error(`Login error for ${provider}:`, err)
      
      // Clear temporary app ID on login failure
      if (mobileAuthStorage.value) {
        mobileAuthStorage.value.clearTemporaryOAuthData()
      }
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout(targetAppId: string) {
    if (!authManager.value) return

    try {
      isLoading.value = true
      error.value = null

      // Use the properly initialized authManager
      await authManager.value.logout()

      // Update state
      isAuthenticated.value = false
      currentProvider.value = null

      // Clear provider tracking
      if (mobileAuthStorage.value) {
        mobileAuthStorage.value.clearLastProvider(targetAppId || undefined)
      }
      
      console.log('Logout successful')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Logout failed'
      console.error('Logout error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function validateToken(_provider: string, _token: string) {
    if (!authManager.value) return false

    try {
      // EntityDataManager doesn't have validateToken, so we'll check if authenticated
      return await authManager.value.isAuthenticated()
    } catch (err) {
      console.error('Token validation error:', err)
      return false
    }
  }

  async function handleCallback() {
    
    if (!mobileAuthStorage.value || !authManager.value) {
      throw new Error('Auth system not initialized. Call initialize() first.')
    }

    try {
      isLoading.value = true
      error.value = null
      
      const { provider } = mobileAuthStorage.value.getTemporaryOAuthData()
      if (provider) {
        await authManager.value.handleCallback(provider)
        mobileAuthStorage.value.setLastProvider(provider, appId.value || undefined)
        currentProvider.value = provider
      } else {
        throw new Error('No provider available for callback handling')
      }

      // Force refresh authentication state after callback
      await refreshAuthenticationState()
      mobileAuthStorage.value.clearTemporaryOAuthData()

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Callback handling failed'
      console.error('Callback handling error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function refreshAuthenticationState() {
    if (!authManager.value) return

    try {
      // Check authentication status from the initialized store
      const authResult = await authManager.value.isAuthenticated()

      // Set authentication state
      if (authResult) {
        isAuthenticated.value = true
        currentProvider.value = currentProvider.value || 
        (mobileAuthStorage.value?.getLastProvider(appId.value || undefined)) || null
   
      } else {
        isAuthenticated.value = false
        currentProvider.value = null

      }
    } catch (err) {
      console.error('Error refreshing authentication state:', err)
    }
  }

  function getTemporaryOAuthData() {
    if (!mobileAuthStorage.value) {
      const tempStorage = new MobileAuthStorage()
      return tempStorage.getTemporaryOAuthData()
    }
    return mobileAuthStorage.value.getTemporaryOAuthData()
  }

  /**
   * Check authentication status for a specific app using AuthManager
   * @param appId - Application ID to check authentication for
   * @returns Authentication status and user info
   */
  async function checkAuthenticationStatus(targetAppId: string) {
    try {
      // Get tenant configuration to initialize AuthManager
      const tenantStore = useTenantStore()
      const tenant = await tenantStore.getTenant(targetAppId)

      if (!tenant || !tenant._data.authConfigs) {
        return {
          isAuthenticated: false,
          error: 'No tenant or auth configuration found'
        }
      }

      // Detect platform and transform auth configs accordingly
      const platform = detectPlatform()
      const authConfigs = transformAuthConfigs(tenant._data.authConfigs, platform)

      if (authConfigs.length === 0) {
        return {
          isAuthenticated: false,
          error: 'No valid auth configurations found'
        }
      }

      await initialize(targetAppId)
      const isAppAuthenticated = await authManager.value.isAuthenticated()
      if (isAppAuthenticated) {
        // Get stored tokens to determine current provider and user info
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
    } catch (error) {
      console.error('Authentication check failed:', error)
      return {
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Authentication check failed'
      }
    }
  }
  /**
   * Set up Capacitor deep link listener for OAuth callbacks
   * This should be called during app initialization to handle incoming URLs
   */
  async function setupCapacitorUrlListener() {
    const platform = detectPlatform()

    if (platform !== 'mobile') return

    try {
      // Listen for app URL events (deep links)
      App.addListener('appUrlOpen', async (event) => {
        console.log('App opened with URL:', event.url)
        try {
          await handleCallback()

          // Navigate to appropriate route after successful callback
          if (isAuthenticated.value && typeof window !== 'undefined') {
            // Use window.location for navigation to avoid router issues
            const redirectUrl = appId.value ? `/app/${appId.value}` : '/'
            window.location.href = redirectUrl
          }
        } catch (callbackError) {
          console.error('Failed to handle OAuth callback:', callbackError)
          // Error is already stored in the store
        }
      })

      console.log('Capacitor URL listener set up successfully')
    } catch (setupError) {
      console.warn('Could not set up Capacitor URL listener:', setupError)
    }
  }

  // Reset store state
  function $reset() {
    authManager.value = null
    mobileAuthStorage.value = null
    isLoading.value = false
    error.value = null
    isInitialized.value = false
    isAuthenticated.value = false
    currentProvider.value = null
    availableProviders.value = []
    appId.value = null
  }

  return {
    // State
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
    validateToken,
    handleCallback,
    refreshAuthenticationState,
    checkAuthenticationStatus,
    setupCapacitorUrlListener,
    getTemporaryOAuthData,
    $reset
  }
}) 