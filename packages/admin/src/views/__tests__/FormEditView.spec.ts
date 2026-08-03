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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import FormEditView from '../FormEditView.vue'
import { getApp, updateApp } from '@/api'

const push = vi.fn()

vi.mock('@/api', () => ({
  getApp: vi.fn(),
  updateApp: vi.fn().mockResolvedValue({ status: 'success' }),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({ showSnackbar: vi.fn() })),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'demo-registry', formIndex: '1' } })),
  useRouter: vi.fn(() => ({ push })),
}))

// Stub the heavy Form.io builder with a v-model-capable placeholder.
vi.mock('@/components/FormioBuilder.vue', () => ({
  default: defineComponent({
    name: 'FormioBuilder',
    props: { modelValue: { type: Object, required: true } },
    emits: ['update:modelValue'],
    template: '<div class="formio-builder-stub" />',
  }),
}))

const baseConfig = () => ({
  id: 'demo-registry',
  name: 'Demo Registry',
  description: 'A demo',
  version: '2',
  entityForms: [
    {
      id: 'household',
      name: 'household',
      title: 'Household',
      formio: { components: [{ key: 'firstName', type: 'textfield', input: true }] },
    },
    {
      id: 'individual',
      name: 'individual',
      title: 'Individual',
      dependsOn: 'household',
      nameField: 'firstName',
      formio: { components: [{ key: 'age', type: 'number', input: true }] },
    },
  ],
  externalSync: { type: 'mock-sync-server' },
})

async function mountView() {
  const wrapper = mount(FormEditView)
  await flushPromises()
  return wrapper
}

async function readConfigFromFormData(formData: FormData) {
  const blob = formData.get('config') as Blob
  const text = await blob.text()
  return JSON.parse(text)
}

describe('FormEditView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(getApp).mockResolvedValue(baseConfig())
    vi.mocked(updateApp).mockResolvedValue({ status: 'success' })
  })

  it('loads the config and shows the selected form title', async () => {
    const wrapper = await mountView()
    expect(getApp).toHaveBeenCalledWith('demo-registry')
    expect(wrapper.text()).toContain('Individual')
  })

  it('shows an error when the form index is out of range', async () => {
    const config = baseConfig()
    config.entityForms = [config.entityForms[0]] // only index 0 exists; route asks for 1
    vi.mocked(getApp).mockResolvedValue(config)
    const wrapper = await mountView()
    expect(wrapper.find('.v-alert').text()).toContain('could not be found')
  })

  it('splices the edited schema into the right form and PUTs the full config', async () => {
    const wrapper = await mountView()

    const editedSchema = { components: [{ key: 'age', type: 'number', input: true }, { key: 'gender', type: 'select', input: true }] }
    wrapper.findComponent({ name: 'FormioBuilder' }).vm.$emit('update:modelValue', editedSchema)
    await flushPromises()

    await wrapper.get('.form-edit-view__actions .v-btn:last-child').trigger('click')
    await flushPromises()

    expect(updateApp).toHaveBeenCalledTimes(1)
    const [id, formData] = vi.mocked(updateApp).mock.calls[0]
    expect(id).toBe('demo-registry')
    expect(formData).toBeInstanceOf(FormData)

    const sent = await readConfigFromFormData(formData as FormData)
    // Edited form (index 1) carries the new schema.
    expect(sent.entityForms[1].formio).toEqual(editedSchema)
    // Untouched form (index 0) is preserved verbatim.
    expect(sent.entityForms[0].formio).toEqual(baseConfig().entityForms[0].formio)
    // Full config preserved (not just forms).
    expect(sent.name).toBe('Demo Registry')
    expect(sent.externalSync).toEqual({ type: 'mock-sync-server' })
  })

  it('re-adds `id: form.name` and keeps nameField on serialized forms', async () => {
    const wrapper = await mountView()
    await wrapper.get('.form-edit-view__actions .v-btn:last-child').trigger('click')
    await flushPromises()

    const [, formData] = vi.mocked(updateApp).mock.calls[0]
    const sent = await readConfigFromFormData(formData as FormData)
    expect(sent.entityForms[0].id).toBe('household')
    expect(sent.entityForms[1].id).toBe('individual')
    expect(sent.entityForms[1].nameField).toBe('firstName')
  })

  it('navigates back to app-details after a successful save', async () => {
    const wrapper = await mountView()
    await wrapper.get('.form-edit-view__actions .v-btn:last-child').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith({ name: 'app-details', params: { id: 'demo-registry' } })
  })
})
