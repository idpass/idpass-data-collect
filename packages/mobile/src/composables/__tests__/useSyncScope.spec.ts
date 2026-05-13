/**
 * @vitest-environment jsdom
 */

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

import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getEventStoreMock = vi.fn()
const lastSyncTime = ref<string | null>(null)

vi.mock('@/store', () => ({
  getEventStore: (...args: unknown[]) => getEventStoreMock(...args),
}))

vi.mock('@/store/syncService', () => ({
  useSyncService: () => ({
    get lastSyncTime() {
      return lastSyncTime.value
    },
  }),
}))

import { useSyncScope } from '@/composables/useSyncScope'

const renderWithComposable = (appId: string) => {
  let api: ReturnType<typeof useSyncScope> | null = null
  const Comp = defineComponent({
    setup() {
      api = useSyncScope(appId)
      return () => h('div')
    },
  })
  const container = document.createElement('div')
  const app = createApp(Comp)
  app.mount(container)
  return {
    unmount: () => app.unmount(),
    getApi: () => api!,
  }
}

describe('useSyncScope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getEventStoreMock.mockReset()
    lastSyncTime.value = null
  })

  it('returns null when no event store is registered', async () => {
    getEventStoreMock.mockReturnValue(null)
    const harness = renderWithComposable('app-1')
    await nextTick()
    await nextTick()
    expect(harness.getApi().scope.value).toBeNull()
    harness.unmount()
  })

  it('reads scope body from the event store on mount', async () => {
    const body = {
      areaIds: ['area-a'],
      entityTypes: ['individual'] as const,
      timeWindow: { type: 'rolling' as const, days: 30 },
      hash: 'h1',
    }
    const getLastScope = vi.fn().mockResolvedValue(body)
    getEventStoreMock.mockReturnValue({ getLastScope })
    const harness = renderWithComposable('app-2')
    await nextTick()
    await nextTick()
    expect(getLastScope).toHaveBeenCalledTimes(1)
    expect(harness.getApi().scope.value).toEqual(body)
    harness.unmount()
  })

  it('refreshes after lastSyncTime advances', async () => {
    const initial = {
      areaIds: null,
      entityTypes: null,
      timeWindow: null,
      hash: 'h0',
    }
    const next = {
      areaIds: ['area-z'],
      entityTypes: null,
      timeWindow: null,
      hash: 'h1',
    }
    const getLastScope = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(next)
    getEventStoreMock.mockReturnValue({ getLastScope })

    const harness = renderWithComposable('app-3')
    await nextTick()
    await nextTick()
    expect(harness.getApi().scope.value).toEqual(initial)

    lastSyncTime.value = new Date().toISOString()
    await nextTick()
    await nextTick()
    expect(getLastScope).toHaveBeenCalledTimes(2)
    expect(harness.getApi().scope.value).toEqual(next)
    harness.unmount()
  })

  it('exposes a stable scope ref across explicit refresh calls', async () => {
    const getLastScope = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        areaIds: ['a'],
        entityTypes: null,
        timeWindow: null,
        hash: 'h2',
      })
    getEventStoreMock.mockReturnValue({ getLastScope })

    const harness = renderWithComposable('app-4')
    await nextTick()
    await nextTick()
    const before = harness.getApi().scope
    await harness.getApi().refresh()
    await nextTick()
    expect(harness.getApi().scope).toBe(before)
    expect(before.value).not.toBeNull()
    harness.unmount()
  })
})
