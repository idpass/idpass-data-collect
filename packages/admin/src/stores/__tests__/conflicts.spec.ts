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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConflictsStore } from '../conflicts'
import type { ConflictRecord } from '@/api'

const mockGetConflicts = vi.fn()
const mockResolveConflict = vi.fn()

vi.mock('@/api', () => ({
  getConflicts: (...args: unknown[]) => mockGetConflicts(...args),
  resolveConflict: (...args: unknown[]) => mockResolveConflict(...args),
}))

const buildConflict = (overrides: Partial<ConflictRecord> = {}): ConflictRecord => ({
  guid: 'conflict-1',
  entityGuid: 'entity-1',
  tenantId: 'tenant-1',
  localVersion: { name: 'local' },
  remoteVersion: { name: 'remote' },
  localEventGuid: 'local-event-1',
  remoteEventGuid: 'remote-event-1',
  detectedAt: '2026-05-06T00:00:00.000Z',
  resolvedAt: null,
  resolution: null,
  resolvedBy: null,
  mergedData: null,
  ...overrides,
})

describe('conflicts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('has an empty array, count 0, loading false, error null', () => {
      const store = useConflictsStore()
      expect(store.conflicts).toEqual([])
      expect(store.unresolvedCount).toBe(0)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.hasConflicts).toBe(false)
    })
  })

  describe('fetchConflicts', () => {
    it('calls API with configId and populates conflicts and unresolvedCount', async () => {
      const conflicts = [
        buildConflict({ guid: 'conflict-1' }),
        buildConflict({ guid: 'conflict-2' }),
      ]
      mockGetConflicts.mockResolvedValue({ conflicts, unresolvedCount: 2 })

      const store = useConflictsStore()
      await store.fetchConflicts('config-1')

      expect(mockGetConflicts).toHaveBeenCalledWith('config-1')
      expect(store.conflicts).toEqual(conflicts)
      expect(store.unresolvedCount).toBe(2)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('sets loading true during the call and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockGetConflicts.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
      )

      const store = useConflictsStore()
      const fetchPromise = store.fetchConflicts('config-1')

      expect(store.loading).toBe(true)

      resolvePromise!({ conflicts: [], unresolvedCount: 0 })
      await fetchPromise

      expect(store.loading).toBe(false)
    })

    it('captures error message on rejection and rethrows', async () => {
      mockGetConflicts.mockRejectedValue(new Error('Network error'))

      const store = useConflictsStore()
      await expect(store.fetchConflicts('config-1')).rejects.toThrow('Network error')

      expect(store.error).toBe('Network error')
      expect(store.loading).toBe(false)
    })
  })

  describe('resolve', () => {
    it('calls resolveConflictApi with full params and re-fetches', async () => {
      mockResolveConflict.mockResolvedValue(buildConflict({ resolution: 'local' }))
      const refreshed = [buildConflict({ guid: 'conflict-2' })]
      mockGetConflicts.mockResolvedValue({ conflicts: refreshed, unresolvedCount: 1 })

      const store = useConflictsStore()
      const params = {
        guid: 'conflict-1',
        configId: 'config-1',
        resolution: 'merged' as const,
        mergedData: { name: 'merged' },
      }

      await store.resolve(params)

      expect(mockResolveConflict).toHaveBeenCalledWith(params)
      expect(mockGetConflicts).toHaveBeenCalledWith('config-1')
      expect(store.conflicts).toEqual(refreshed)
      expect(store.unresolvedCount).toBe(1)
    })
  })

  describe('hasConflicts', () => {
    it('reflects the conflicts array length', async () => {
      const store = useConflictsStore()
      expect(store.hasConflicts).toBe(false)

      mockGetConflicts.mockResolvedValue({
        conflicts: [buildConflict()],
        unresolvedCount: 1,
      })
      await store.fetchConflicts('config-1')
      expect(store.hasConflicts).toBe(true)

      mockGetConflicts.mockResolvedValue({ conflicts: [], unresolvedCount: 0 })
      await store.fetchConflicts('config-1')
      expect(store.hasConflicts).toBe(false)
    })
  })
})
