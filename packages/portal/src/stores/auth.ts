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
import { ref, computed } from 'vue'
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

let userManagerInstance: UserManager | null = null

function getUserManager(): UserManager {
  if (!userManagerInstance) {
    userManagerInstance = new UserManager({
      authority: import.meta.env.VITE_KEYCLOAK_ISSUER,
      client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
      redirect_uri: import.meta.env.VITE_KEYCLOAK_REDIRECT_URI,
      post_logout_redirect_uri: import.meta.env.VITE_KEYCLOAK_POST_LOGOUT_URI,
      response_type: 'code',
      scope: 'openid profile email',
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
    })
  }
  return userManagerInstance
}

export const useAuthStore = defineStore('portalAuth', () => {
  const user = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  const accessToken = computed<string | null>(() => user.value?.access_token ?? null)

  const displayName = computed<string>(() => {
    if (!user.value) return ''
    const profile = user.value.profile
    return (
      (profile.name as string | undefined) ||
      (profile.preferred_username as string | undefined) ||
      (profile.email as string | undefined) ||
      ''
    )
  })

  const email = computed<string | null>(() => {
    if (!user.value) return null
    return (user.value.profile.email as string | undefined) ?? null
  })

  async function initialize(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const manager = getUserManager()
      const loadedUser = await manager.getUser()
      user.value = loadedUser

      manager.events.addUserLoaded((loadedUser) => {
        user.value = loadedUser
      })

      manager.events.addUserUnloaded(() => {
        user.value = null
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.auth.initFailed'
      user.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function signIn(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await getUserManager().signinRedirect()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.auth.signInFailed'
      isLoading.value = false
    }
  }

  async function handleCallback(): Promise<User> {
    isLoading.value = true
    error.value = null
    try {
      const manager = getUserManager()
      const callbackUser = await manager.signinRedirectCallback()
      user.value = callbackUser
      return callbackUser
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.auth.callbackFailed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function signOut(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await getUserManager().signoutRedirect()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.auth.signOutFailed'
      isLoading.value = false
    }
  }

  function getAccessToken(): string | null {
    return accessToken.value
  }

  return {
    user,
    isAuthenticated,
    accessToken,
    displayName,
    email,
    isLoading,
    error,
    initialize,
    signIn,
    handleCallback,
    signOut,
    getAccessToken,
  }
})

// Exported for testing purposes only
export { getUserManager }
