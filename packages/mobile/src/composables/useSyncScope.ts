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

import { onMounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { EffectiveScopeBody } from '@idpass/data-collect-core'
import { getEventStore } from '@/store'
import { useSyncService } from '@/store/syncService'

export interface UseSyncScopeReturn {
  /** Reactive scope body. `null` when no scope has been recorded yet. */
  scope: Ref<EffectiveScopeBody | null>
  /** Force a re-read of the persisted scope; safe to call repeatedly. */
  refresh: () => Promise<void>
}

/**
 * Reactive accessor for the last `EffectiveScopeBody` persisted by the sync
 * machine for the given app. Reads via `getEventStore(appId).getLastScope()`
 * and refreshes automatically after `syncService.startSync` completes.
 *
 * `initStore(appId)` must already have been called by the view; this
 * composable does not bootstrap the store. If the EventStore is not yet
 * available the returned ref stays `null`.
 */
export function useSyncScope(
  appId: MaybeRefOrGetter<string>,
): UseSyncScopeReturn {
  const scope = ref<EffectiveScopeBody | null>(null)
  const syncService = useSyncService()

  const refresh = async (): Promise<void> => {
    const id = toValue(appId)
    if (!id) {
      scope.value = null
      return
    }
    const eventStore = getEventStore(id)
    if (!eventStore) {
      scope.value = null
      return
    }
    try {
      scope.value = await eventStore.getLastScope()
    } catch {
      // Defensive: storage failures should not crash the sync screen.
      scope.value = null
    }
  }

  onMounted(() => {
    void refresh()
  })

  // `appId` may be a ref/getter when the badge is mounted before route params
  // resolve. Re-fetch whenever the id changes.
  watch(
    () => toValue(appId),
    () => {
      void refresh()
    },
  )

  // Refresh after every successful sync. `lastSyncTime` is updated only on
  // success; subscribing to it (rather than `isSynced`) avoids a spurious
  // refresh when pending events drop to zero via local edits alone.
  watch(
    () => syncService.lastSyncTime,
    (next, prev) => {
      if (next && next !== prev) {
        void refresh()
      }
    },
  )

  return { scope, refresh }
}
