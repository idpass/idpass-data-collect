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
import ProgramDiscoverDialog from '../ProgramDiscoverDialog.vue'

const mockDiscover = vi.fn()

vi.mock('@/api', () => ({
  discoverOpenSppPrograms: (...args: unknown[]) => mockDiscover(...args),
}))

const vuetify = createVuetify({ components, directives })

const PROGRAMS = [
  {
    id: 3,
    identifier: 'urn:openspp:program|widow-support',
    name: 'Widow Support',
    code: 'widow',
    state: 'active',
    targetType: 'individual' as const,
  },
  {
    id: 7,
    identifier: 'urn:openspp:program|elderly-cash',
    name: 'Elderly Cash',
    code: 'ect',
    state: 'active',
    targetType: 'individual' as const,
  },
]

let activeWrapper: VueWrapper | null = null

function mountDialog(
  props: {
    modelValue?: boolean
    creds?: { url: string; clientId: string; clientSecret: string }
    linkedIdentifiers?: string[]
  } = {},
) {
  const wrapper = mount(ProgramDiscoverDialog, {
    attachTo: document.body,
    props: {
      modelValue: true,
      creds: { url: 'http://x', clientId: 'c', clientSecret: 's' },
      linkedIdentifiers: [],
      ...props,
    },
    global: {
      plugins: [vuetify],
    },
  })
  activeWrapper = wrapper
  return wrapper
}

describe('ProgramDiscoverDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  const ID_3 = 'urn:openspp:program|widow-support'
  const ID_7 = 'urn:openspp:program|elderly-cash'
  // CSS.escape isn't available in jsdom; use attribute-selector quotes instead.
  const ROW_3 = `[data-test="row-${ID_3}"]`
  const ROW_7 = `[data-test="row-${ID_7}"]`

  it('fetches programs on mount + pre-checks already-linked', async () => {
    mockDiscover.mockResolvedValue({ programs: PROGRAMS, total: 2, truncated: false })
    mountDialog({ linkedIdentifiers: [ID_3] })
    await flushPromises()

    expect(mockDiscover).toHaveBeenCalled()
    const rows = document.querySelectorAll('.program-row')
    expect(rows).toHaveLength(2)

    const row3Checkbox = document.querySelector(`${ROW_3} input[type=checkbox]`) as HTMLInputElement | null
    const row7Checkbox = document.querySelector(`${ROW_7} input[type=checkbox]`) as HTMLInputElement | null
    expect(row3Checkbox?.checked).toBe(true)
    expect(row7Checkbox?.checked).toBe(false)
  })

  it('emits save with diff (added + removed identifiers)', async () => {
    mockDiscover.mockResolvedValue({ programs: PROGRAMS, total: 2, truncated: false })
    const wrapper = mountDialog({ linkedIdentifiers: [ID_3] })
    await flushPromises()

    const row7Checkbox = document.querySelector(`${ROW_7} input[type=checkbox]`) as HTMLInputElement | null
    expect(row7Checkbox).toBeTruthy()
    row7Checkbox!.checked = true
    row7Checkbox!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const row3Checkbox = document.querySelector(`${ROW_3} input[type=checkbox]`) as HTMLInputElement | null
    expect(row3Checkbox).toBeTruthy()
    row3Checkbox!.checked = false
    row3Checkbox!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const saveBtn = document.querySelector('[data-test="save-btn"]') as HTMLElement | null
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()
    await flushPromises()

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { programs: { id?: number; identifier: string }[] }
    expect(payload.programs.find((p) => p.identifier === ID_7)).toBeTruthy()
    expect(payload.programs.find((p) => p.identifier === ID_3)).toBeUndefined()
  })

  it('shows error banner on backend failure', async () => {
    mockDiscover.mockRejectedValue(new Error('openspp_auth_failed'))
    mountDialog({ linkedIdentifiers: [] })
    await flushPromises()

    const banner = document.querySelector('[data-test="error-banner"]')
    expect(banner).toBeTruthy()
    expect(banner!.textContent).toContain('openspp_auth_failed')
  })
})
