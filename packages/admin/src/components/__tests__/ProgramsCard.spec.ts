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
import ProgramsCard from '../ProgramsCard.vue'
import type { AppProgram } from '@/api'

const mockUpdateAppPrograms = vi.fn()

vi.mock('@/api', () => ({
  updateAppPrograms: (...args: unknown[]) => mockUpdateAppPrograms(...args),
  discoverOpenSppPrograms: vi.fn().mockResolvedValue({ programs: [], total: 0, truncated: false }),
}))

const vuetify = createVuetify({ components, directives })

let activeWrapper: VueWrapper | null = null

function mountCard(props: { appId?: string; programs?: AppProgram[] } = {}) {
  const wrapper = mount(ProgramsCard, {
    attachTo: document.body,
    props: {
      appId: 'test-app',
      programs: [],
      ...props,
    },
    global: {
      plugins: [vuetify],
    },
  })
  activeWrapper = wrapper
  return wrapper
}

describe('ProgramsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateAppPrograms.mockResolvedValue({ status: 'success', programs: [] })
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  it('renders "No programs configured" when empty', () => {
    const wrapper = mountCard({ programs: [] })
    expect(wrapper.find('[data-testid="programs-summary"]').text()).toContain('No programs')
  })

  it('renders chip with count and id+name rows when programs present', () => {
    const programs: AppProgram[] = [
      { id: 2, name: 'Widow Disability Support', code: 'widow' },
      { id: 7, name: 'Maternity Allowance' },
    ]
    const wrapper = mountCard({ programs })
    const summary = wrapper.find('[data-testid="programs-summary"]').text()
    expect(summary).toContain('2 programs')
    expect(summary).toContain('#2')
    expect(summary).toContain('Widow Disability Support')
    expect(summary).toContain('#7')
    expect(summary).toContain('Maternity Allowance')
  })

  it('saves edits via updateAppPrograms and emits update:programs', async () => {
    const programs: AppProgram[] = [{ id: 2, name: 'Widow Disability Support' }]
    mockUpdateAppPrograms.mockResolvedValue({ status: 'success', programs })
    const wrapper = mountCard({ programs })

    await wrapper.find('[data-testid="programs-edit-btn"]').trigger('click')
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="programs-save-btn"]',
    ) as HTMLElement | null
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()
    await flushPromises()

    expect(mockUpdateAppPrograms).toHaveBeenCalledWith('test-app', [
      { id: 2, name: 'Widow Disability Support', code: undefined },
    ])
    const emitted = wrapper.emitted('update:programs')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual(programs)
  })

  it('shows API error in inline alert when save fails', async () => {
    mockUpdateAppPrograms.mockRejectedValue(new Error('network down'))
    const wrapper = mountCard({ programs: [{ id: 2, name: 'OK' }] })

    await wrapper.find('[data-testid="programs-edit-btn"]').trigger('click')
    await flushPromises()

    const saveBtn = document.querySelector(
      '[data-testid="programs-save-btn"]',
    ) as HTMLElement | null
    saveBtn!.click()
    await flushPromises()

    const errorAlert = document.querySelector('[data-testid="programs-error"]')
    expect(errorAlert).toBeTruthy()
    expect(errorAlert!.textContent).toContain('network down')
    expect(wrapper.emitted('update:programs')).toBeFalsy()
  })
})
