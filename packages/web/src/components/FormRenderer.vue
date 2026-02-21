<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

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

    const form = await Formio.createForm(formContainer.value, props.schema, formOptions)

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
