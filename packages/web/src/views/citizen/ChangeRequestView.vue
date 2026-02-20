<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSelfServiceEntity, submitSelfServiceForm } from '@/api/selfService'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const error = ref<string | null>(null)
const submitting = ref(false)
const submitSuccess = ref(false)
const submitError = ref<string | null>(null)
const entityData = ref<Record<string, unknown>>({})

const tenantId = route.params.tenantId as string
const formType = route.params.formType as string

// Build simple form fields from entity data
const formFields = ref<Array<{ key: string; value: unknown; label: string }>>([])

const hiddenFields = new Set([
  'oidcSubject', 'password', 'passwordHash', 'secret',
  'guid', 'id', 'type', 'memberIds',
])

onMounted(async () => {
  try {
    const result = await getSelfServiceEntity()
    entityData.value = result.entity.data

    // Generate editable form fields from entity data
    formFields.value = Object.entries(result.entity.data)
      .filter(([key]) => !hiddenFields.has(key))
      .map(([key, value]) => ({
        key,
        value: value ?? '',
        label: key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' '),
      }))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load form'
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  submitting.value = true
  submitError.value = null

  try {
    const formData: Record<string, unknown> = {}
    for (const field of formFields.value) {
      formData[field.key] = field.value
    }

    await submitSelfServiceForm({
      formType,
      formData,
    })

    submitSuccess.value = true
    setTimeout(() => {
      router.push(`/citizen/${tenantId}/submissions`)
    }, 2000)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Submission failed'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/citizen/${tenantId}`" />
      <h1 class="text-h4 ml-2">
        {{ formType.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }}
      </h1>
    </div>

    <LoadingState :loading="loading" :error="error">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        Your change request has been submitted. Redirecting to submissions...
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <v-card v-if="!submitSuccess" variant="outlined" class="pa-4">
        <v-card-title class="text-h6 mb-4">Update Your Information</v-card-title>

        <v-form @submit.prevent="handleSubmit">
          <v-text-field
            v-for="field in formFields"
            :key="field.key"
            v-model="field.value"
            :label="field.label"
            variant="outlined"
            density="comfortable"
            class="mb-2 text-capitalize"
          />

          <v-alert v-if="!formFields.length" type="info" variant="tonal" class="mb-4">
            No editable fields available.
          </v-alert>

          <div class="d-flex justify-end mt-4">
            <v-btn
              variant="text"
              class="mr-2"
              :to="`/citizen/${tenantId}`"
            >
              Cancel
            </v-btn>
            <v-btn
              type="submit"
              color="primary"
              :loading="submitting"
              :disabled="!formFields.length"
            >
              Submit Change Request
            </v-btn>
          </div>
        </v-form>
      </v-card>
    </LoadingState>
  </div>
</template>
