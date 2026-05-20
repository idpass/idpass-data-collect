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
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ProgramsEditor from '../ProgramsEditor.vue'

vi.mock('@/api', () => ({
  discoverOpenSppPrograms: vi.fn().mockResolvedValue({ programs: [], total: 0, truncated: false }),
}))

const vuetify = createVuetify({ components, directives })

let activeWrapper: VueWrapper | null = null

describe('ProgramsEditor (discovery-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  it('does not render manual-add controls', () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [],
        adapterType: 'openspp-v2-adapter',
        creds: { url: 'http://x', clientId: 'c', clientSecret: 's' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    expect(wrapper.find('[data-test=add-manually-btn]').exists()).toBe(false)
    expect(wrapper.find('[data-test=program-id-input]').exists()).toBe(false)
  })

  it('disables discover button when adapter is wrong', () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [],
        adapterType: 'mock-sync-server',
        creds: { url: '', clientId: '', clientSecret: '' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    expect(wrapper.find('[data-test=discover-btn]').attributes('disabled')).toBeDefined()
  })

  it('disables discover button when any cred is empty', () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [],
        adapterType: 'openspp-v2-adapter',
        creds: { url: 'http://x', clientId: '', clientSecret: 's' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    expect(wrapper.find('[data-test=discover-btn]').attributes('disabled')).toBeDefined()
  })

  it('enables discover button when adapter + creds are all set', () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [],
        adapterType: 'openspp-v2-adapter',
        creds: { url: 'http://x', clientId: 'c', clientSecret: 's' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    expect(wrapper.find('[data-test=discover-btn]').attributes('disabled')).toBeUndefined()
  })

  it('renders a row per linked program with id, name, and code', () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [
          { id: 3, name: 'Widow Support', code: 'widow' },
          { id: 7, name: 'Elderly Cash' },
        ],
        adapterType: 'openspp-v2-adapter',
        creds: { url: 'http://x', clientId: 'c', clientSecret: 's' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    expect(wrapper.find('[data-test=row-3]').exists()).toBe(true)
    expect(wrapper.find('[data-test=row-7]').exists()).toBe(true)
    expect(wrapper.find('[data-test=row-3]').text()).toContain('Widow Support')
    expect(wrapper.find('[data-test=row-3]').text()).toContain('widow')
  })

  it('emits update:modelValue when x removes a row', async () => {
    const wrapper = mount(ProgramsEditor, {
      attachTo: document.body,
      props: {
        modelValue: [{ id: 3, name: 'Widow Support', code: 'widow' }],
        adapterType: 'openspp-v2-adapter',
        creds: { url: 'http://x', clientId: 'c', clientSecret: 's' },
      },
      global: { plugins: [vuetify] },
    })
    activeWrapper = wrapper
    await wrapper.find('[data-test=remove-3]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0][0]).toEqual([])
  })
})
