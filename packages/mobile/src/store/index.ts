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

// household-data-manager store
import {
  AuthConfig,
  AuthManager,
  DeviceIdentity,
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  IndexedDbEventStorageAdapter,
  IndexedDbEntityStorageAdapter,
  EventApplierService,
  InternalSyncManager,
  IndexedDbAuthStorageAdapter
} from '@idpass/data-collect-core'
import { SecureStorageService } from '@/services/SecureStorageService'

const REFRESH_TOKEN_KEY_PREFIX = 'sync_refresh_'

export let store: EntityDataManager

const storeCache = new Map<string, EntityDataManager>()

/**
 * Store refresh token in secure storage for silent re-authentication.
 * Encrypted at rest via iOS Keychain / Android Keystore.
 * Uses a long-lived refresh token (30d) instead of raw credentials.
 */
export async function saveRefreshTokenForReauth(appId: string, refreshToken: string): Promise<void> {
  await SecureStorageService.set(`${REFRESH_TOKEN_KEY_PREFIX}${appId}`, refreshToken)
}

/**
 * Remove stored refresh token (called on explicit logout).
 */
export async function clearRefreshTokenForReauth(appId: string): Promise<void> {
  await SecureStorageService.remove(`${REFRESH_TOKEN_KEY_PREFIX}${appId}`)
}

export const initStore = async (
  appId: string = 'default',
  syncServerUrl: string = import.meta.env.VITE_SYNC_URL,
  authConfigs: AuthConfig[] = []
) => {
  if (storeCache.has(appId)) {
    store = storeCache.get(appId)!
    return
  }

  const eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter(appId))
  const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter(appId))

  const authStorage = new IndexedDbAuthStorageAdapter(appId)
  const authManagerInstance = new AuthManager(authConfigs, syncServerUrl, authStorage)
  await Promise.all([
    entityStore.initialize(),
    eventStore.initialize(),
    authManagerInstance?.initialize(),
    authStorage.initialize()
  ])

  // Silent re-authentication callback: uses refresh token stored in SecureStorage
  // to obtain a fresh access token when the JWT has expired during sync.
  const reauthenticate = async () => {
    const refreshToken = await SecureStorageService.get(`${REFRESH_TOKEN_KEY_PREFIX}${appId}`)
    if (!refreshToken) {
      throw new Error('No stored refresh token available for re-authentication')
    }
    const response = await fetch(`${syncServerUrl}/api/users/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) {
      await clearRefreshTokenForReauth(appId)
      throw new Error('Refresh token expired or invalid — re-login required')
    }
    const data = await response.json() as { token: string; refreshToken: string }
    await authStorage.setToken('default', data.token)
    await saveRefreshTokenForReauth(appId, data.refreshToken)
  }

  const eventApplierService = new EventApplierService(eventStore, entityStore)
  const deviceIdentity = new DeviceIdentity()
  const deviceId = await deviceIdentity.getOrCreateDeviceId()

  // Late-bound EDM reference: InternalSyncManager needs a purgeOutOfScope
  // callback at construction time, but EDM is built after ISM (because EDM's
  // constructor takes ISM). The closure below captures `edmRef` which is
  // populated immediately after `store` is created. Scope rotation cannot
  // fire before sync runs, so the post-init assignment is always in place
  // by the time the callback is invoked.
  let edmRef: EntityDataManager | null = null
  const purgeOutOfScope = async (keep: readonly string[]) => {
    if (!edmRef) {
      // Defensive: should never happen post-init.
      return
    }
    await edmRef.purgeEntitiesNotIn(keep)
  }

  const internalSyncManager = new InternalSyncManager(
    eventStore,
    entityStore,
    eventApplierService,
    syncServerUrl,
    authStorage,
    appId,
    reauthenticate,
    deviceId,
    purgeOutOfScope,
  )

  store = new EntityDataManager(
    eventStore,
    entityStore,
    eventApplierService,
    null,
    internalSyncManager,
    authManagerInstance
  )
  edmRef = store
  storeCache.set(appId, store)
}

export const closeStore = async (appId: string) => {
  if (storeCache.has(appId)) {
    const store = storeCache.get(appId)
    await store.closeConnection()
    storeCache.delete(appId)
  }
}
