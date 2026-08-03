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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import SyncScopeForm from '../SyncScopeForm.vue'
import type { SyncScopePolicy } from '@idpass/data-collect-core'

const vuetify = createVuetify({ components, directives })

let activeWrapper: VueWrapper | null = null

function mountForm(props: { modelValue?: SyncScopePolicy | null } = {}) {
  const wrapper = mount(SyncScopeForm, {
    attachTo: document.body,
    props: {
      modelValue: null,
      ...props,
    },
    global: {
      plugins: [vuetify],
    },
  })
  activeWrapper = wrapper
  return wrapper
}

describe('SyncScopeForm', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  it('pre-fills inputs from a policy', async () => {
    mountForm({
      modelValue: {
        areaIds: ['A1', 'A2'],
        entityTypes: ['group'],
        timeWindow: { type: 'rolling', days: 30 },
      },
    })
    await flushPromises()

    const areasInput = document.querySelector(
      '[data-testid="sync-scope-areas-input"] textarea',
    ) as HTMLTextAreaElement | null
    expect(areasInput).toBeTruthy()
    expect(areasInput!.value).toBe('A1, A2')

    const daysInput = document.querySelector(
      '[data-testid="sync-scope-time-days"] input',
    ) as HTMLInputElement | null
    expect(daysInput?.value).toBe('30')
  })

  it('emits update:modelValue when the user toggles areas on and types a value', async () => {
    const wrapper = mountForm({ modelValue: null })
    await flushPromises()

    // Toggle areas on
    const areasToggle = document.querySelector(
      '[data-testid="sync-scope-areas-toggle"] input[type="checkbox"]',
    ) as HTMLInputElement | null
    expect(areasToggle).toBeTruthy()
    areasToggle!.click()
    await flushPromises()

    // Type into the now-visible textarea
    const areasInput = document.querySelector(
      '[data-testid="sync-scope-areas-input"] textarea',
    ) as HTMLTextAreaElement | null
    expect(areasInput).toBeTruthy()
    areasInput!.value = 'A7, A8'
    areasInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    const last = updates![updates!.length - 1][0] as SyncScopePolicy | null
    expect(last).toEqual({ areaIds: ['A7', 'A8'], entityTypes: null, timeWindow: null })
  })

  it('emits update:valid=false and update:error when areas toggled on but empty', async () => {
    const wrapper = mountForm({ modelValue: null })
    await flushPromises()

    const areasToggle = document.querySelector(
      '[data-testid="sync-scope-areas-toggle"] input[type="checkbox"]',
    ) as HTMLInputElement | null
    areasToggle!.click()
    await flushPromises()

    const validUpdates = wrapper.emitted('update:valid')
    const errorUpdates = wrapper.emitted('update:error')
    expect(validUpdates).toBeTruthy()
    expect(errorUpdates).toBeTruthy()
    expect(validUpdates![validUpdates!.length - 1][0]).toBe(false)
    expect(errorUpdates![errorUpdates!.length - 1][0]).toContain('Areas')
  })

  it('emits null modelValue when all toggles are off (unbounded)', async () => {
    const wrapper = mountForm({
      modelValue: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })
    await flushPromises()

    // Toggle areas off
    const areasToggle = document.querySelector(
      '[data-testid="sync-scope-areas-toggle"] input[type="checkbox"]',
    ) as HTMLInputElement | null
    areasToggle!.click()
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue')
    expect(updates).toBeTruthy()
    const last = updates![updates!.length - 1][0]
    expect(last).toBeNull()
  })

  it('exposes a build() helper that mirrors the live state', async () => {
    const wrapper = mountForm({
      modelValue: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
    })
    await flushPromises()

    const built = (wrapper.vm as unknown as { build: () => unknown }).build() as {
      policy: SyncScopePolicy | null
      error: string | null
    }
    expect(built.error).toBeNull()
    expect(built.policy).toEqual({ areaIds: ['A1'], entityTypes: null, timeWindow: null })
  })
})
