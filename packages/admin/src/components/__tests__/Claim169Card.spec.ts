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

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import Claim169Card from '../Claim169Card.vue'
import * as api from '@/api'

vi.mock('@/api', () => ({
  updateAppClaim169: vi.fn(),
}))

const vuetify = createVuetify({ components, directives })

describe('Claim169Card', () => {
  it('renders summary chip with issuer count', () => {
    const wrapper = mount(Claim169Card, {
      props: {
        appId: 't1',
        modelValue: {
          enabled: true,
          trustedIssuers: [{ issuerId: 'did:web:x', publicKey: { ed25519: 'AAAA' } }],
        },
      },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('Enabled')
    expect(wrapper.text()).toContain('1 trusted issuer')
  })

  it('PATCHes on save + emits update:modelValue', async () => {
    ;(api.updateAppClaim169 as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'success' })
    const wrapper = mount(Claim169Card, {
      props: { appId: 't1', modelValue: { enabled: false, trustedIssuers: [] } },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    await wrapper.find('[data-test=edit-btn]').trigger('click')
    await wrapper.vm.$nextTick()
    // Toggle enabled in the dialog editor — use input.click() per Task 9 implementer note
    // (jsdom doesn't propagate setValue() through v-switch)
    const enableInput = document.querySelector('[data-test=enable-toggle] input') as HTMLInputElement
    enableInput.click()
    await wrapper.vm.$nextTick()
    // v-dialog teleports content to document.body, so query the save button there too.
    const saveBtn = document.querySelector('[data-test=save-btn]') as HTMLElement
    saveBtn.click()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(api.updateAppClaim169).toHaveBeenCalledWith('t1', expect.objectContaining({ enabled: true }))
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })
})
