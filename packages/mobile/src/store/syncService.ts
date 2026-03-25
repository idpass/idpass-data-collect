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
import { store as entityStore } from '@/store'

export interface SyncHistoryEntry {
  timestamp: string
  success: boolean
  error?: string
  eventsUploaded?: number
}

export const useSyncService = defineStore('syncService', () => {
  const isSyncing = ref(false)
  const lastSyncTime = ref<string | null>(null)
  const lastSyncError = ref<string | null>(null)
  const pendingCount = ref(0)
  const totalEntities = ref(0)
  const syncHistory = ref<SyncHistoryEntry[]>([])
  const currentAppId = ref<string | null>(null)

  const isSynced = computed(() => pendingCount.value === 0)

  const syncedCount = computed(() =>
    Math.max(totalEntities.value - pendingCount.value, 0)
  )

  async function refreshCounts() {
    try {
      const [entities, unsynced] = await Promise.all([
        entityStore.getAllEntities(),
        entityStore.getUnsyncedEventsCount()
      ])
      totalEntities.value = entities.length
      pendingCount.value = unsynced
    } catch (error) {
      console.error('Failed to refresh sync counts:', error)
    }
  }

  async function startSync(appId: string): Promise<boolean> {
    if (isSyncing.value) {
      return false
    }

    currentAppId.value = appId
    isSyncing.value = true
    lastSyncError.value = null

    try {
      await entityStore.syncWithSyncServer()
      lastSyncTime.value = new Date().toISOString()

      addHistoryEntry({ timestamp: lastSyncTime.value, success: true })
      await refreshCounts()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      lastSyncError.value = message

      addHistoryEntry({
        timestamp: new Date().toISOString(),
        success: false,
        error: message
      })
      return false
    } finally {
      isSyncing.value = false
    }
  }

  function addHistoryEntry(entry: SyncHistoryEntry) {
    syncHistory.value = [entry, ...syncHistory.value].slice(0, 10)
  }

  function $reset() {
    isSyncing.value = false
    lastSyncTime.value = null
    lastSyncError.value = null
    pendingCount.value = 0
    totalEntities.value = 0
    syncHistory.value = []
    currentAppId.value = null
  }

  return {
    isSyncing,
    lastSyncTime,
    lastSyncError,
    pendingCount,
    totalEntities,
    syncHistory,
    currentAppId,
    isSynced,
    syncedCount,
    refreshCounts,
    startSync,
    $reset
  }
})
