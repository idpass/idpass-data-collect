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

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import fixture from '@/test/fixtures/formio-roundtrip-sample.json'
import FormioBuilder from '../FormioBuilder.vue'

const vuetify = createVuetify()

type Handler = () => void
const handlers = new Map<string, Handler[]>()

const builderInstance = {
  schema: { ...fixture } as object,
  setForm: vi.fn(async (s: object) => {
    builderInstance.schema = JSON.parse(JSON.stringify(s))
  }),
  on: vi.fn((event: string, handler: Handler) => {
    const list = handlers.get(event) ?? []
    list.push(handler)
    handlers.set(event, list)
  }),
  destroy: vi.fn(),
}

vi.mock('@formio/js', () => ({
  Formio: {
    builder: vi.fn(async (_el: HTMLElement, initial: object) => {
      builderInstance.schema = JSON.parse(JSON.stringify(initial))
      return builderInstance
    }),
  },
}))

vi.mock('@/formio/loadBuilderAssets', () => ({
  loadBuilderAssets: vi.fn(),
}))

describe('FormioBuilder schema round-trip', () => {
  it('emits the input schema unchanged when no edits occur', async () => {
    const wrapper = mount(FormioBuilder, {
      props: { modelValue: JSON.parse(JSON.stringify(fixture)) },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    handlers.get('change')?.forEach((h) => h())
    await flushPromises()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual(fixture)
  })
})
