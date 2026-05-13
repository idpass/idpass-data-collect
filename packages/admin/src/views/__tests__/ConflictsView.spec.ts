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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ConflictsView from '../ConflictsView.vue'
import type { ConflictRecord } from '@/api'

const buildConflict = (overrides: Partial<ConflictRecord> = {}): ConflictRecord => ({
  guid: 'conflict-1',
  entityGuid: 'entity-abcdef-001',
  tenantId: 'tenant-1',
  localVersion: { name: 'local-name', age: 30 },
  remoteVersion: { name: 'remote-name', age: 31 },
  localEventGuid: 'local-event-1',
  remoteEventGuid: 'remote-event-1',
  detectedAt: '2026-05-06T00:00:00.000Z',
  resolvedAt: null,
  resolution: null,
  resolvedBy: null,
  mergedData: null,
  ...overrides,
})

const mockFetchConflicts = vi.fn()
const mockResolve = vi.fn()
const mockShowSnackbar = vi.fn()

const storeState: {
  conflicts: ConflictRecord[]
  loading: boolean
  error: string | null
  unresolvedCount: number
  hasConflicts: boolean
} = {
  conflicts: [],
  loading: false,
  error: null,
  unresolvedCount: 0,
  hasConflicts: false,
}

vi.mock('@/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api')
  return {
    ...actual,
    getConflicts: vi.fn().mockResolvedValue({ conflicts: [], unresolvedCount: 0 }),
    resolveConflict: vi.fn().mockResolvedValue({}),
  }
})

vi.mock('@/stores/conflicts', () => ({
  useConflictsStore: vi.fn(() => ({
    get conflicts() {
      return storeState.conflicts
    },
    get loading() {
      return storeState.loading
    },
    get error() {
      return storeState.error
    },
    get unresolvedCount() {
      return storeState.unresolvedCount
    },
    get hasConflicts() {
      return storeState.hasConflicts
    },
    fetchConflicts: mockFetchConflicts,
    resolve: mockResolve,
  })),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({
    showSnackbar: mockShowSnackbar,
  })),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'config-1' } })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

const resetStoreState = () => {
  storeState.conflicts = []
  storeState.loading = false
  storeState.error = null
  storeState.unresolvedCount = 0
  storeState.hasConflicts = false
}

const closeDialogIfOpen = async () => {
  const cancelBtn = document.querySelector<HTMLButtonElement>(
    '[data-testid="resolve-cancel-btn"]',
  )
  if (cancelBtn) {
    cancelBtn.click()
    await nextTick()
    await nextTick()
  }
}

const cleanupWrapper = async (wrapper: VueWrapper) => {
  await closeDialogIfOpen()
  wrapper.unmount()
  document.body.innerHTML = ''
}

describe('ConflictsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetStoreState()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders empty state when no conflicts', () => {
    const wrapper = mount(ConflictsView)
    expect(wrapper.find('[data-testid="conflicts-empty-state"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No unresolved conflicts')
    wrapper.unmount()
  })

  it('renders a row for each conflict', async () => {
    storeState.conflicts = [
      buildConflict({ guid: 'conflict-1', entityGuid: 'entity-1' }),
      buildConflict({ guid: 'conflict-2', entityGuid: 'entity-2' }),
    ]
    storeState.hasConflicts = true
    storeState.unresolvedCount = 2

    const wrapper = mount(ConflictsView)
    await nextTick()

    expect(wrapper.find('[data-testid="conflicts-empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="conflict-resolve-btn-conflict-2"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens the resolve dialog when resolve button is clicked', async () => {
    storeState.conflicts = [buildConflict({ guid: 'conflict-1' })]
    storeState.hasConflicts = true
    storeState.unresolvedCount = 1

    const wrapper = mount(ConflictsView, {
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').trigger('click')
    await nextTick()
    await nextTick()

    const dialog = document.querySelector('[data-testid="resolve-dialog"]')
    expect(dialog).not.toBeNull()
    await cleanupWrapper(wrapper)
  })

  it('calls resolve with resolution "local" when Keep local + Save', async () => {
    storeState.conflicts = [buildConflict({ guid: 'conflict-1' })]
    storeState.hasConflicts = true
    mockResolve.mockResolvedValue(undefined)

    const wrapper = mount(ConflictsView, { attachTo: document.body })
    await nextTick()

    await wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').trigger('click')
    await nextTick()
    await nextTick()

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="resolve-save-btn"]',
    )
    expect(saveBtn).not.toBeNull()
    saveBtn!.click()
    await nextTick()
    await nextTick()

    expect(mockResolve).toHaveBeenCalledWith({
      guid: 'conflict-1',
      configId: 'config-1',
      resolution: 'local',
    })
    await cleanupWrapper(wrapper)
  })

  it('calls resolve with parsed mergedData when Merge + valid JSON + Save', async () => {
    storeState.conflicts = [buildConflict({ guid: 'conflict-1' })]
    storeState.hasConflicts = true
    mockResolve.mockResolvedValue(undefined)

    const wrapper = mount(ConflictsView, { attachTo: document.body })
    await nextTick()

    await wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').trigger('click')
    await nextTick()
    await nextTick()

    const mergedRadio = document.querySelector<HTMLElement>(
      '[data-testid="resolve-radio-merged"] input',
    )
    expect(mergedRadio).not.toBeNull()
    mergedRadio!.click()
    await nextTick()

    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="merged-data-input"] textarea',
    )
    expect(textarea).not.toBeNull()
    textarea!.value = '{"name":"merged-name","age":40}'
    textarea!.dispatchEvent(new Event('input'))
    await nextTick()

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="resolve-save-btn"]',
    )
    expect(saveBtn).not.toBeNull()
    saveBtn!.click()
    await nextTick()
    await nextTick()

    expect(mockResolve).toHaveBeenCalledWith({
      guid: 'conflict-1',
      configId: 'config-1',
      resolution: 'merged',
      mergedData: { name: 'merged-name', age: 40 },
    })
    await cleanupWrapper(wrapper)
  })

  it('disables Save when Merge is selected with invalid JSON', async () => {
    storeState.conflicts = [buildConflict({ guid: 'conflict-1' })]
    storeState.hasConflicts = true

    const wrapper = mount(ConflictsView, { attachTo: document.body })
    await nextTick()

    await wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').trigger('click')
    await nextTick()
    await nextTick()

    const mergedRadio = document.querySelector<HTMLElement>(
      '[data-testid="resolve-radio-merged"] input',
    )
    mergedRadio!.click()
    await nextTick()

    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="merged-data-input"] textarea',
    )
    textarea!.value = 'not valid json'
    textarea!.dispatchEvent(new Event('input'))
    await nextTick()

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="resolve-save-btn"]',
    )
    expect(saveBtn!.disabled).toBe(true)
    await cleanupWrapper(wrapper)
  })

  it('rejects merged JSON arrays as invalid (must be object)', async () => {
    storeState.conflicts = [buildConflict({ guid: 'conflict-1' })]
    storeState.hasConflicts = true

    const wrapper = mount(ConflictsView, { attachTo: document.body })
    await nextTick()

    await wrapper.find('[data-testid="conflict-resolve-btn-conflict-1"]').trigger('click')
    await nextTick()
    await nextTick()

    const mergedRadio = document.querySelector<HTMLElement>(
      '[data-testid="resolve-radio-merged"] input',
    )
    mergedRadio!.click()
    await nextTick()

    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="merged-data-input"] textarea',
    )
    textarea!.value = '[1,2,3]'
    textarea!.dispatchEvent(new Event('input'))
    await nextTick()

    const saveBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="resolve-save-btn"]',
    )
    expect(saveBtn!.disabled).toBe(true)
    await cleanupWrapper(wrapper)
  })

  it('displays an alert when store has an error', async () => {
    storeState.error = 'Network error'

    const wrapper = mount(ConflictsView)
    await nextTick()

    expect(wrapper.find('[data-testid="conflicts-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Network error')
    wrapper.unmount()
  })
})
