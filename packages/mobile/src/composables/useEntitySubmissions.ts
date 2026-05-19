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

import { ref } from 'vue'
import { store } from '@/store'
import { SyncLevel } from '@idpass/data-collect-core'

export type SubmissionSnapshot = {
  lastUpdated: string
  version: number
  data: Record<string, unknown>
  name?: string
  type?: string
}

export type SubmissionStatus = 'synced' | 'pending' | 'draft' | 'unknown'

export type SubmissionRecord = {
  guid: string
  initial: SubmissionSnapshot
  modified: SubmissionSnapshot
  status: SubmissionStatus
}

const resolveStatus = (
  snapshot: { initial: SubmissionSnapshot; modified: SubmissionSnapshot },
  latestEvent?: { syncLevel: SyncLevel } | undefined,
): SubmissionStatus => {
  if (snapshot.modified.data.externalId) {
    return 'synced'
  }

  const syncLevel =
    (snapshot.modified.data.syncLevel as SyncLevel | undefined) ??
    (snapshot.modified.data.sync_status as SyncLevel | undefined)

  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'synced'
  }

  if (syncLevel === SyncLevel.LOCAL) {
    return 'pending'
  }

  if (latestEvent) {
    if (latestEvent.syncLevel === SyncLevel.REMOTE || latestEvent.syncLevel === SyncLevel.EXTERNAL) {
      return 'synced'
    }
    if (latestEvent.syncLevel === SyncLevel.LOCAL) {
      return 'pending'
    }
  }

  if ((snapshot.modified.data.status as string | undefined)?.toLowerCase() === 'draft') {
    return 'draft'
  }

  if (snapshot.modified.version !== snapshot.initial.version) {
    return 'pending'
  }

  return 'synced'
}

const buildRecord = (
  entity: {
    initial: { lastUpdated: string; version: number; data: Record<string, unknown>; name?: string; type?: string }
    modified: { guid: string; lastUpdated: string; version: number; data: Record<string, unknown>; name?: string; type?: string }
  },
  latestEvent?: { syncLevel: SyncLevel } | undefined,
): SubmissionRecord => {
  const snap = {
    guid: entity.modified.guid,
    initial: {
      lastUpdated: entity.initial.lastUpdated,
      version: entity.initial.version,
      data: entity.initial.data,
      name: entity.initial.name,
      type: entity.initial.type,
    },
    modified: {
      lastUpdated: entity.modified.lastUpdated,
      version: entity.modified.version,
      data: entity.modified.data,
      name: entity.modified.name,
      type: entity.modified.type,
    },
  }
  return { ...snap, status: resolveStatus(snap, latestEvent) }
}

/**
 * Load entity submissions for the current tenant store with sync status resolved
 * from latest events. Callers filter by form name / parent / search on top.
 *
 * Extracted from EntityView.vue so the new unified AppView can share the
 * same loading + status-resolution logic without duplicating it.
 */
export function useEntitySubmissions() {
  const submissions = ref<SubmissionRecord[]>([])
  const isLoading = ref(false)

  const load = async () => {
    isLoading.value = true
    try {
      const [allEntities, allEvents] = await Promise.all([
        store.getAllEntities(),
        store.getAllEvents(),
      ])

      const latestByGuid = new Map<string, (typeof allEvents)[0]>()
      for (const event of allEvents) {
        const existing = latestByGuid.get(event.entityGuid)
        if (!existing || new Date(event.timestamp) > new Date(existing.timestamp)) {
          latestByGuid.set(event.entityGuid, event)
        }
      }

      submissions.value = allEntities.map((entity) => buildRecord(entity, latestByGuid.get(entity.modified.guid)))
    } finally {
      isLoading.value = false
    }
  }

  return { submissions, isLoading, load }
}

export { resolveStatus, buildRecord }
