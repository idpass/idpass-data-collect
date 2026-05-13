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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import type { EffectiveScopeBody } from '@idpass/data-collect-core'

const scopeRef = ref<EffectiveScopeBody | null>(null)
const flagEnabled = ref(true)

vi.mock('@/composables/useFeatureFlag', () => ({
  useFeatureFlag: () => computed(() => flagEnabled.value),
}))

vi.mock('@/composables/useSyncScope', () => ({
  useSyncScope: () => ({
    scope: scopeRef,
    refresh: vi.fn(),
  }),
}))

import SyncScopeBadge from '@/components/SyncScopeBadge.vue'

const vuetify = createVuetify({ components, directives })

let activeApp: App | null = null
let activeContainer: HTMLElement | null = null

const renderBadge = async (appId = 'test-app') => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({
    setup() {
      return () => h(SyncScopeBadge, { appId })
    },
  })
  app.use(vuetify)
  app.mount(container)
  activeApp = app
  activeContainer = container
  await nextTick()
  await nextTick()
  return container
}

describe('SyncScopeBadge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    scopeRef.value = null
    flagEnabled.value = true
  })

  afterEach(() => {
    activeApp?.unmount()
    activeApp = null
    if (activeContainer && activeContainer.parentNode) {
      activeContainer.parentNode.removeChild(activeContainer)
    }
    activeContainer = null
    document.body.innerHTML = ''
  })

  it('renders nothing when the scopedSync flag is off', async () => {
    flagEnabled.value = false
    const container = await renderBadge()
    expect(container.querySelector('[data-testid="sync-scope-badge"]')).toBeNull()
  })

  it('shows "Unbounded" when scope is null', async () => {
    scopeRef.value = null
    const container = await renderBadge()
    const badge = container.querySelector('[data-testid="sync-scope-badge"]')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toContain('Unbounded')
  })

  it('shows the area count when only areaIds is set', async () => {
    scopeRef.value = {
      areaIds: ['a-1', 'a-2', 'a-3'],
      entityTypes: null,
      timeWindow: null,
      hash: 'h',
    }
    const container = await renderBadge()
    const badge = container.querySelector('[data-testid="sync-scope-badge"]')
    expect(badge!.textContent).toContain('3 areas')
    expect(badge!.textContent).not.toContain('individual')
    expect(badge!.textContent).not.toContain('last')
  })

  it('joins all three dims for a fully-specified rolling scope', async () => {
    scopeRef.value = {
      areaIds: ['a-1'],
      entityTypes: ['individual', 'group'],
      timeWindow: { type: 'rolling', days: 90 },
      hash: 'h',
    }
    const container = await renderBadge()
    const badge = container.querySelector('[data-testid="sync-scope-badge"]')
    const text = badge!.textContent ?? ''
    expect(text).toContain('1 area')
    expect(text).toContain('individual+group')
    expect(text).toContain('last 90d')
  })

  it('renders a fixed time window with a localized date', async () => {
    scopeRef.value = {
      areaIds: null,
      entityTypes: null,
      timeWindow: { type: 'fixed', floor: '2024-01-15T00:00:00.000Z' },
      hash: 'h',
    }
    const container = await renderBadge()
    const badge = container.querySelector('[data-testid="sync-scope-badge"]')
    const text = badge!.textContent ?? ''
    expect(text).toContain('since')
    expect(text).toMatch(/\d/)
  })
})
