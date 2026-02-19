<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '@/stores/notification'
import { useFormReviewStore } from '@/stores/formReview'
import { getRequestTypes, getRequestTypeForm, createRequest } from '@/api/changeRequests'
import { type FormioComponent } from '@/composables/useFormio'
import ChangeRequestForm from '@/components/ChangeRequestForm.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import type { RequestType } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const notificationStore = useNotificationStore()
const formReviewStore = useFormReviewStore()

const typeCode = computed(() => route.query.type as string | undefined)

const formData = computed<Record<string, unknown>>(() => {
  return formReviewStore.formData
})

const requestType = ref<RequestType | null>(null)
const formSchema = ref<{ components: FormioComponent[] } | null>(null)
const isLoading = ref(false)
const isSubmitting = ref(false)

onMounted(async () => {
  if (!typeCode.value) {
    router.push({ name: 'request-create' })
    return
  }

  // If the store is empty (direct navigation), redirect back
  if (Object.keys(formReviewStore.formData).length === 0) {
    router.push({ name: 'request-create' })
    return
  }

  await loadTypeAndSchema(typeCode.value)
})

async function loadTypeAndSchema(code: string): Promise<void> {
  isLoading.value = true
  try {
    const [types, schemaResponse] = await Promise.all([
      getRequestTypes(),
      getRequestTypeForm(code),
    ])
    requestType.value = types.find((t) => t.code === code) ?? null
    formSchema.value = schemaResponse.formioSchema as { components: FormioComponent[] }
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isLoading.value = false
  }
}

function handleGoBack(): void {
  router.push({
    name: 'request-create',
    query: { type: typeCode.value, step: 'form' },
  })
}

async function handleSubmit(): Promise<void> {
  if (!typeCode.value) return
  isSubmitting.value = true
  try {
    const request = await createRequest(typeCode.value, formData.value, true)
    formReviewStore.clear()
    router.push({
      name: 'request-confirmation',
      query: { ref: request.reference, type: requestType.value?.label ?? typeCode.value },
    })
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="portal-content">
    <h1 class="text-h5 font-weight-bold mb-2">
      {{ t('requestReview.pageTitle') }}
    </h1>
    <p class="text-body-1 text-medium-emphasis mb-6">
      {{ t('requestReview.subtitle') }}
    </p>

    <template v-if="isLoading">
      <LoadingSkeleton type="article" :count="2" />
    </template>

    <template v-else>
      <v-card rounded="lg" variant="outlined" class="mb-4">
        <v-card-text class="pa-4">
          <div class="d-flex align-center">
            <v-icon
              icon="mdi-file-document-outline"
              color="primary"
              class="me-3"
            />
            <div>
              <p class="text-subtitle-1 font-weight-medium">
                {{ requestType?.label }}
              </p>
              <p class="text-body-2 text-medium-emphasis">
                {{ requestType?.description }}
              </p>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" elevation="1" class="mb-6">
        <v-card-text class="pa-5">
          <ChangeRequestForm
            v-if="formSchema"
            :components="formSchema.components"
            :model-value="formData"
            :errors="{}"
            :readonly="true"
          />
        </v-card-text>
      </v-card>

      <div class="d-flex flex-column gap-3">
        <v-btn
          color="primary"
          size="large"
          block
          prepend-icon="mdi-send-outline"
          :loading="isSubmitting"
          :disabled="isSubmitting"
          @click="handleSubmit"
        >
          {{ isSubmitting ? t('requestReview.submitting') : t('requestReview.submitButton') }}
        </v-btn>

        <v-btn
          variant="outlined"
          size="large"
          block
          prepend-icon="mdi-arrow-left"
          :disabled="isSubmitting"
          @click="handleGoBack"
        >
          {{ t('requestReview.editButton') }}
        </v-btn>
      </div>
    </template>
  </div>
</template>
