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
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  IndexedDbEventStorageAdapter,
  IndexedDbEntityStorageAdapter,
  EventApplierService,
  InternalSyncManager
} from 'idpass-data-collect'

export let store: EntityDataManager

const storeCache = new Map<string, EntityDataManager>()

export const initStore = async (
  userId: string,
  token: string,
  appId: string = 'default',
  syncServerUrl: string = import.meta.env.VITE_SYNC_URL
) => {
  if (storeCache.has(appId)) {
    store = storeCache.get(appId)
    return
  }

  console.log('initializing store', appId, syncServerUrl)

  const eventStore = new EventStoreImpl(userId, new IndexedDbEventStorageAdapter(appId))
  const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter(appId))
  await Promise.all([entityStore.initialize(), eventStore.initialize()])
  const eventApplierService = new EventApplierService(userId, eventStore, entityStore)
  const internalSyncManager = new InternalSyncManager(
    eventStore,
    entityStore,
    eventApplierService,
    syncServerUrl,
    token,
    appId
  )
  // External sync adapter is not used in the client
  // const syncAdapter = new SyncAdapterImpl('')
  store = new EntityDataManager(
    eventStore,
    entityStore,
    eventApplierService,
    null,
    internalSyncManager
  )
  storeCache.set(appId, store)
}

export const closeStore = async (appId: string) => {
  if (storeCache.has(appId)) {
    const store = storeCache.get(appId)
    await store.closeConnection()
    storeCache.delete(appId)
  }
}
