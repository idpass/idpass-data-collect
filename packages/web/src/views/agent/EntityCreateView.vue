<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/stores/tenant'
import { useFormRenderer } from '@/composables/useFormRenderer'
import FormRenderer from '@/components/FormRenderer.vue'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const tenantStore = useTenantStore()
const { submitting, submitError, submitForm } = useFormRenderer()
const loading = ref(true)
const submitSuccess = ref(false)

const tenantId = route.params.tenantId as string
const entityType = route.params.entity as string

onMounted(async () => {
  await tenantStore.loadConfig(tenantId)
  loading.value = false
})

const entityForm = computed(() => {
  return tenantStore.currentConfig?.entityForms?.find((f) => f.id === entityType) ?? null
})

async function handleFormSubmit(data: Record<string, unknown>) {
  const result = await submitForm({
    tenantId,
    entityGuid: null,
    formType: entityType,
    formData: data,
  })

  if (result.success) {
    submitSuccess.value = true
    setTimeout(() => {
      router.push(`/agent/${tenantId}/${entityType}`)
    }, 1500)
  }
}

function handleCancel() {
  router.push(`/agent/${tenantId}/${entityType}`)
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="handleCancel" />
      <h1 class="text-h4 ml-2">{{ entityForm?.title || 'Create Entity' }}</h1>
    </div>

    <LoadingState :loading="loading" :error="tenantStore.error">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        Entity created successfully. Redirecting...
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <v-card v-if="entityForm?.formio" class="pa-4">
        <FormRenderer :schema="entityForm.formio" @submit="handleFormSubmit" />
        <v-overlay :model-value="submitting" contained class="align-center justify-center">
          <v-progress-circular indeterminate color="primary" />
        </v-overlay>
      </v-card>

      <v-alert v-else-if="!loading" type="warning" variant="tonal">
        No form schema found for entity type "{{ entityType }}".
      </v-alert>
    </LoadingState>
  </div>
</template>
