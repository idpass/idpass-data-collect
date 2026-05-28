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

import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import Claim169Editor from '../Claim169Editor.vue'

const vuetify = createVuetify({ components, directives })

const empty = { enabled: false, trustedIssuers: [] as Array<{ issuerId: string; publicKey: { ed25519?: string; es256?: string } }> }

let activeWrapper: VueWrapper | null = null

describe('Claim169Editor', () => {
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })

  it('toggles enabled flag', async () => {
    const wrapper = mount(Claim169Editor, {
      props: { modelValue: { ...empty, trustedIssuers: [] } },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    activeWrapper = wrapper

    // v-switch portals its input; click the input to flip + emit update.
    const input = document.querySelector(
      '[data-test=enable-toggle] input',
    ) as HTMLInputElement | null
    expect(input).toBeTruthy()
    input!.click()
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ enabled: true })
  })

  it('adds + removes trusted issuer', async () => {
    const wrapper = mount(Claim169Editor, {
      props: { modelValue: { ...empty, trustedIssuers: [] } },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    activeWrapper = wrapper

    await wrapper.find('[data-test=add-issuer-btn]').trigger('click')
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { trustedIssuers: unknown[] }
    expect(payload.trustedIssuers).toHaveLength(1)
  })

  it('flags incomplete when enabled but no issuers', () => {
    const wrapper = mount(Claim169Editor, {
      props: { modelValue: { enabled: true, trustedIssuers: [] } },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    activeWrapper = wrapper

    expect(wrapper.find('[data-test=incomplete-warning]').exists()).toBe(true)
  })

  it('validates ed25519 base64 length', () => {
    const wrapper = mount(Claim169Editor, {
      props: {
        modelValue: {
          enabled: true,
          trustedIssuers: [{ issuerId: 'did:web:x', publicKey: { ed25519: 'tooshort' } }],
        },
      },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    activeWrapper = wrapper

    expect(wrapper.find('[data-test=ed25519-error-0]').exists()).toBe(true)
  })
})
