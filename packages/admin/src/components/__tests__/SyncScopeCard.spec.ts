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
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import SyncScopeCard from '../SyncScopeCard.vue'
import type { SyncScopePolicy } from '@idpass/data-collect-core'

const mockUpdateAppSyncScope = vi.fn()

vi.mock('@/api', () => ({
  updateAppSyncScope: (...args: unknown[]) => mockUpdateAppSyncScope(...args),
}))

const vuetify = createVuetify({ components, directives })

let activeWrapper: VueWrapper | null = null

function mountCard(props: { appId?: string; policy?: SyncScopePolicy | null } = {}) {
  const wrapper = mount(SyncScopeCard, {
    attachTo: document.body,
    props: {
      appId: 'test-app',
      policy: null,
      ...props,
    },
    global: {
      plugins: [vuetify],
    },
  })
  activeWrapper = wrapper
  return wrapper
}

describe('SyncScopeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateAppSyncScope.mockResolvedValue({ status: 'success', syncScope: null })
  })

  afterEach(() => {
    // Unmount + clear document.body — Vuetify dialogs portal into body and leak across tests.
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  it('renders "Unbounded" when policy is null', () => {
    const wrapper = mountCard({ policy: null })
    expect(wrapper.find('[data-testid="sync-scope-summary"]').text()).toContain('Unbounded')
  })

  it('renders "Unbounded" when all policy dims are null', () => {
    const wrapper = mountCard({
      policy: { areaIds: null, entityTypes: null, timeWindow: null },
    })
    expect(wrapper.find('[data-testid="sync-scope-summary"]').text()).toContain('Unbounded')
  })

  it('renders summary line for a policy with areas + types', () => {
    const wrapper = mountCard({
      policy: { areaIds: ['A1', 'A2'], entityTypes: ['individual'] },
    })
    const summary = wrapper.find('[data-testid="sync-scope-summary"]').text()
    expect(summary).toContain('2 areas')
    expect(summary).toContain('individual')
  })

  it('opens the edit dialog with values pre-filled', async () => {
    const wrapper = mountCard({
      policy: {
        areaIds: ['A1', 'A2'],
        entityTypes: ['group'],
        timeWindow: { type: 'rolling', days: 30 },
      },
    })
    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    const areasInput = document.querySelector('[data-testid="sync-scope-areas-input"] textarea')
    expect(areasInput).toBeTruthy()
    expect((areasInput as HTMLTextAreaElement).value).toBe('A1, A2')

    const daysInput = document.querySelector(
      '[data-testid="sync-scope-time-days"] input',
    ) as HTMLInputElement | null
    expect(daysInput?.value).toBe('30')
  })

  it('saves a policy via updateAppSyncScope and emits update:policy', async () => {
    mockUpdateAppSyncScope.mockResolvedValue({
      status: 'success',
      syncScope: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })
    const wrapper = mountCard({
      policy: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })

    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="sync-scope-save-btn"]',
    ) as HTMLElement | null
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()
    await flushPromises()

    expect(mockUpdateAppSyncScope).toHaveBeenCalledWith('test-app', {
      areaIds: ['A1'],
      entityTypes: null,
      timeWindow: null,
    })
    const emitted = wrapper.emitted('update:policy')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual({ areaIds: ['A1'], entityTypes: null, timeWindow: null })
  })

  it('blocks save with inline error when areas toggled on but empty', async () => {
    const wrapper = mountCard({ policy: null })

    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    // Toggle the areas checkbox via its underlying input (Vuetify renders an <input type=checkbox>).
    const areasToggle = document.querySelector(
      '[data-testid="sync-scope-areas-toggle"] input[type="checkbox"]',
    ) as HTMLInputElement | null
    expect(areasToggle).toBeTruthy()
    areasToggle!.click()
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="sync-scope-save-btn"]',
    ) as HTMLElement | null
    saveBtn!.click()
    await flushPromises()

    expect(mockUpdateAppSyncScope).not.toHaveBeenCalled()
    const validation = document.querySelector('[data-testid="sync-scope-validation"]')
    expect(validation).toBeTruthy()
    expect(validation!.textContent).toContain('Areas')
    expect(validation!.textContent).toContain('at least one')
  })

  it('disables the Save button while the form is invalid', async () => {
    const wrapper = mountCard({ policy: null })

    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    // Toggle areas on without any input -> form is invalid.
    const areasToggle = document.querySelector(
      '[data-testid="sync-scope-areas-toggle"] input[type="checkbox"]',
    ) as HTMLInputElement | null
    areasToggle!.click()
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="sync-scope-save-btn"]',
    ) as HTMLElement | null
    // Vuetify v-btn applies `disabled` to the rendered <button>, plus the
    // `v-btn--disabled` class for visual state. Either is sufficient evidence.
    const isDisabled =
      (saveBtn as HTMLButtonElement | null)?.disabled === true ||
      saveBtn?.classList.contains('v-btn--disabled') === true
    expect(isDisabled).toBe(true)
  })

  it('clears policy via PATCH with null when confirmed', async () => {
    mockUpdateAppSyncScope.mockResolvedValue({ status: 'success', syncScope: null })
    const wrapper = mountCard({
      policy: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })

    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    const clearBtn = document.querySelector(
      '[data-testid="sync-scope-clear-btn"]',
    ) as HTMLElement | null
    clearBtn!.click()
    await flushPromises()

    const confirmBtn = document.querySelector(
      '[data-testid="sync-scope-clear-confirm-btn"]',
    ) as HTMLElement | null
    confirmBtn!.click()
    await flushPromises()

    expect(mockUpdateAppSyncScope).toHaveBeenCalledWith('test-app', null)
    const emitted = wrapper.emitted('update:policy')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBeNull()
  })

  it('shows API error in inline alert when save fails', async () => {
    mockUpdateAppSyncScope.mockRejectedValue(new Error('network down'))
    const wrapper = mountCard({
      policy: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })

    await wrapper.find('[data-testid="sync-scope-edit-btn"]').trigger('click')
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="sync-scope-save-btn"]',
    ) as HTMLElement | null
    saveBtn!.click()
    await flushPromises()

    const errorAlert = document.querySelector('[data-testid="sync-scope-error"]')
    expect(errorAlert).toBeTruthy()
    expect(errorAlert!.textContent).toContain('network down')
    expect(wrapper.emitted('update:policy')).toBeFalsy()
  })
})
