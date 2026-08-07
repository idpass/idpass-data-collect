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
import FormioRenderer from '../FormioRenderer.vue'

const vuetify = createVuetify()

const formInstance = {
  destroy: vi.fn(),
}

const createFormMock = vi.fn<
  (element: HTMLElement, schema: object, options?: object) => Promise<typeof formInstance>
>(async () => formInstance)

vi.mock('@formio/js', () => ({
  Formio: {
    createForm: (...args: unknown[]) =>
      createFormMock(...(args as [HTMLElement, object, object?])),
  },
}))

vi.mock('@/formio/loadBuilderAssets', () => ({
  loadBuilderAssets: vi.fn(),
}))

// Custom-component registration touches the real Formio.Components registry,
// which the @formio/js mock above does not provide. These tests cover the
// renderer lifecycle, not registration, so stub it out.
vi.mock('@/formio/builderComponents', () => ({
  registerBuilderComponents: vi.fn(),
}))

describe('FormioRenderer', () => {
  beforeEach(() => {
    formInstance.destroy.mockClear()
    createFormMock.mockClear()
    createFormMock.mockImplementation(async () => formInstance)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form read-only with the given schema', async () => {
    const schema = { components: [{ type: 'textfield', key: 'name', label: 'Name' }] }
    mount(FormioRenderer, {
      props: { schema },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    expect(createFormMock).toHaveBeenCalledTimes(1)
    const [el, passedSchema, options] = createFormMock.mock.calls[0]
    expect(el).toBeInstanceOf(HTMLElement)
    expect(passedSchema).toEqual(schema)
    expect(options).toMatchObject({ readOnly: true })
  })

  it('destroys the form instance on unmount', async () => {
    const wrapper = mount(FormioRenderer, {
      props: { schema: { components: [] } },
      global: { plugins: [vuetify] },
    })
    await flushPromises()
    wrapper.unmount()
    await flushPromises()
    expect(formInstance.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a form created during mount even if unmounted before it resolves', async () => {
    let resolveForm: (v: typeof formInstance) => void = () => {}
    const pending = new Promise<typeof formInstance>((resolve) => {
      resolveForm = resolve
    })
    createFormMock.mockImplementationOnce(() => pending)
    const wrapper = mount(FormioRenderer, {
      props: { schema: { components: [] } },
      global: { plugins: [vuetify] },
    })
    wrapper.unmount()
    resolveForm(formInstance)
    await flushPromises()
    expect(formInstance.destroy).toHaveBeenCalledTimes(1)
  })
})
