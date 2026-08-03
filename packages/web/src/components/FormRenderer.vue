<!--
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
-->

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'formiojs/dist/formio.full.min.css'

const props = defineProps<{
  schema: Record<string, unknown>
  submission?: Record<string, unknown>
  readOnly?: boolean
}>()

const emit = defineEmits<{
  submit: [data: Record<string, unknown>]
}>()

const formContainer = ref<HTMLElement | null>(null)
const formReady = ref(false)
const formError = ref<string | null>(null)
let formInstance: unknown = null

function ensureSubmitButton(schema: Record<string, unknown>): Record<string, unknown> {
  const components = schema.components as Array<Record<string, unknown>> | undefined
  if (!components) return schema

  const hasSubmit = components.some(
    (c) => c.type === 'button' && c.action === 'submit',
  )
  if (hasSubmit) return schema

  return {
    ...schema,
    components: [
      ...components,
      {
        key: 'submit',
        type: 'button',
        input: true,
        label: 'Submit',
        action: 'submit',
        theme: 'primary',
      },
    ],
  }
}

async function renderForm() {
  if (!formContainer.value || !props.schema) return

  formReady.value = false
  formError.value = null

  try {
    // Dynamic import to avoid hard dependency
    const { Formio } = await import('formiojs')

    // Clear previous form
    if (formInstance && typeof (formInstance as { destroy: () => void }).destroy === 'function') {
      ;(formInstance as { destroy: () => void }).destroy()
    }
    formContainer.value.innerHTML = ''

    const formOptions: Record<string, unknown> = {
      readOnly: props.readOnly || false,
    }

    const schemaWithButton = props.readOnly ? props.schema : ensureSubmitButton(props.schema)
    const form = await Formio.createForm(formContainer.value, schemaWithButton, formOptions)

    if (props.submission) {
      form.submission = { data: props.submission }
    }

    form.on('submit', (submissionData: { data: Record<string, unknown> }) => {
      emit('submit', submissionData.data)
    })

    formInstance = form
    formReady.value = true
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to load form renderer'
    if (import.meta.env.DEV) console.error('Form.io render error:', error)
  }
}

onMounted(renderForm)

watch(() => props.schema, renderForm)
</script>

<template>
  <div>
    <v-alert v-if="formError" type="error" class="mb-4">
      {{ formError }}
    </v-alert>
    <v-progress-linear v-if="!formReady && !formError" indeterminate color="primary" class="mb-2" />
    <div v-show="formReady" ref="formContainer" />
  </div>
</template>
