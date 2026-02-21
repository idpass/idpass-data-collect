<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/stores/tenant'
import { useFormRenderer } from '@/composables/useFormRenderer'
import { getEntity, type EntityRecord } from '@/api/entities'
import FormRenderer from '@/components/FormRenderer.vue'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const tenantStore = useTenantStore()
const { submitting, submitError, submitForm } = useFormRenderer()
const entity = ref<EntityRecord | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const submitSuccess = ref(false)

const tenantId = route.params.tenantId as string
const entityType = route.params.entity as string
const guid = route.params.guid as string

async function loadData() {
  loading.value = true
  error.value = null
  try {
    await tenantStore.loadConfig(tenantId)
    entity.value = await getEntity(guid, tenantId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load entity'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const entityForm = computed(() => {
  return tenantStore.currentConfig?.entityForms?.find((f) => f.id === entityType) ?? null
})

const updateFormType = computed(() => {
  if (!entity.value) return entityType
  if (entity.value.type === 'group') return 'update-group'
  if (entity.value.type === 'record') return 'update-record'
  return 'update-individual'
})

async function handleFormSubmit(data: Record<string, unknown>) {
  if (!entity.value) return

  const result = await submitForm({
    tenantId,
    entityGuid: entity.value.guid,
    formType: updateFormType.value,
    formData: data,
  })

  if (result.success) {
    submitSuccess.value = true
    setTimeout(() => {
      router.push(`/agent/${tenantId}/${entityType}/${guid}`)
    }, 1500)
  }
}

function handleCancel() {
  router.push(`/agent/${tenantId}/${entityType}/${guid}`)
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="handleCancel" />
      <h1 class="text-h4 ml-2">Edit Entity</h1>
    </div>

    <LoadingState :loading="loading" :error="error || tenantStore.error" @retry="loadData">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        Entity updated successfully. Redirecting...
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <v-card v-if="entityForm?.formio && entity" class="pa-4">
        <FormRenderer :schema="entityForm.formio" :submission="entity.data" @submit="handleFormSubmit" />
        <v-overlay :model-value="submitting" contained class="align-center justify-center">
          <v-progress-circular indeterminate color="primary" />
        </v-overlay>
      </v-card>

      <v-alert v-else-if="!loading && !entity" type="error" variant="tonal">
        Entity not found.
      </v-alert>

      <v-alert v-else-if="!loading && !entityForm?.formio" type="warning" variant="tonal">
        No form schema found for entity type "{{ entityType }}".
      </v-alert>
    </LoadingState>
  </div>
</template>
