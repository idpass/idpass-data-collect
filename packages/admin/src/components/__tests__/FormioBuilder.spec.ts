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
import { flushPromises, mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import FormioBuilder from '../FormioBuilder.vue'

const vuetify = createVuetify()

// Capture handlers registered with builder.on(...) so the test can fire them.
type Handler = () => void
const handlers = new Map<string, Handler[]>()

const builderInstance = {
  schema: { components: [] as unknown[] },
  setForm: vi.fn(async () => {}),
  on: vi.fn((event: string, handler: Handler) => {
    const list = handlers.get(event) ?? []
    list.push(handler)
    handlers.set(event, list)
  }),
  destroy: vi.fn(),
}

const builderMock = vi.fn<
  (element: HTMLElement, schema: object, options?: object) => Promise<typeof builderInstance>
>(async () => builderInstance)

vi.mock('@formio/js', () => ({
  Formio: {
    builder: (...args: unknown[]) => builderMock(...(args as [HTMLElement, object, object?])),
  },
}))

vi.mock('@/formio/loadBuilderAssets', () => ({
  loadBuilderAssets: vi.fn(),
}))

describe('FormioBuilder', () => {
  beforeEach(() => {
    handlers.clear()
    builderInstance.schema = { components: [] }
    builderInstance.setForm.mockClear()
    builderInstance.on.mockClear()
    builderInstance.destroy.mockClear()
    builderMock.mockClear()
  })

  afterEach(() => {
    handlers.clear()
  })

  it('mounts the builder with the initial schema', async () => {
    const initial = { components: [{ type: 'textfield', key: 'name', label: 'Name' }] }
    mount(FormioBuilder, {
      props: { modelValue: initial },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    expect(builderMock).toHaveBeenCalledTimes(1)
    const [el, schema] = builderMock.mock.calls[0]
    expect(el).toBeInstanceOf(HTMLElement)
    expect(schema).toEqual(initial)
  })

  it('emits update:modelValue when the builder fires change', async () => {
    const initial = { components: [] }
    const wrapper = mount(FormioBuilder, {
      props: { modelValue: initial },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    builderInstance.schema = { components: [{ type: 'textfield', key: 'a' }] }
    handlers.get('change')?.forEach((h) => h())
    await flushPromises()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual({
      components: [{ type: 'textfield', key: 'a' }],
    })
  })

  it('destroys the builder instance on unmount', async () => {
    const wrapper = mount(FormioBuilder, {
      props: { modelValue: { components: [] } },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    wrapper.unmount()
    await flushPromises()
    expect(builderInstance.destroy).toHaveBeenCalledTimes(1)
  })

  it('calls setForm when modelValue prop changes after mount', async () => {
    const initial = { components: [] }
    const wrapper = mount(FormioBuilder, {
      props: { modelValue: initial },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    builderInstance.setForm.mockClear()
    await wrapper.setProps({
      modelValue: { components: [{ type: 'textfield', key: 'new', label: 'New' }] },
    })
    await flushPromises()
    expect(builderInstance.setForm).toHaveBeenCalledTimes(1)
    const calls = builderInstance.setForm.mock.calls as unknown as object[][]
    expect(calls[0][0]).toEqual({
      components: [{ type: 'textfield', key: 'new', label: 'New' }],
    })
  })

  it('suppresses the change echo triggered by setForm', async () => {
    const initial = { components: [] }
    const wrapper = mount(FormioBuilder, {
      props: { modelValue: initial },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    // Simulate the parent pushing a new schema. The watcher calls setForm,
    // which under @formio/js fires `change`. The wrapper must NOT re-emit
    // that echo back to the parent.
    builderInstance.setForm.mockImplementationOnce((async (...args: unknown[]) => {
      const [s] = args as [object]
      builderInstance.schema = JSON.parse(JSON.stringify(s))
      handlers.get('change')?.forEach((h) => h())
    }) as () => Promise<void>)
    await wrapper.setProps({
      modelValue: { components: [{ type: 'textfield', key: 'x' }] },
    })
    await flushPromises()
    const emittedAfter = (wrapper.emitted('update:modelValue') ?? []).length
    // Reset: no emit should have happened after the prop-driven setForm.
    // (Earlier emits during mount, if any, would only count as 0 or 1 baseline.)
    // We assert by checking emit count did not grow due to the synthetic
    // change echo above.
    const baselineMount = 0
    expect(emittedAfter).toBe(baselineMount)
  })
})
