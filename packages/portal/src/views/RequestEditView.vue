<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '@/stores/notification'
import { useDraftsStore } from '@/stores/drafts'
import { useFormReviewStore } from '@/stores/formReview'
import { getRequestTypeForm } from '@/api/changeRequests'
import { useFormio, type FormioComponent } from '@/composables/useFormio'
import { useAutoSave } from '@/composables/useAutoSave'
import ChangeRequestForm from '@/components/ChangeRequestForm.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import type { PortalDraft } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const notificationStore = useNotificationStore()
const draftsStore = useDraftsStore()
const formReviewStore = useFormReviewStore()

const draftId = computed(() => route.query.draftId as string | undefined)

const draft = ref<PortalDraft | null>(null)
const formSchema = ref<{ components: FormioComponent[] } | null>(null)
const isLoading = ref(false)

const { formData, errors, inputComponents, setFieldValue, validateAll, initializeFormData } =
  useFormio(formSchema)

const { saveStatus, lastSavedAt, saveNow } = useAutoSave(
  formData,
  async (data) => {
    if (!draft.value) return
    await draftsStore.saveDraft(draft.value.id, draft.value.changeRequestType, data)
  },
  { debounceMs: 5000, maxRetries: 3 },
)

onMounted(async () => {
  if (!draftId.value) {
    router.push({ name: 'dashboard' })
    return
  }
  await loadDraft(draftId.value)
})

async function loadDraft(id: string): Promise<void> {
  isLoading.value = true
  try {
    // Ensure drafts are loaded
    if (draftsStore.drafts.length === 0) {
      await draftsStore.fetchDrafts()
    }
    const found = draftsStore.drafts.find((d) => d.id === id)
    if (!found) {
      notificationStore.showNotification(t('requestEdit.loadError'), 'error')
      router.push({ name: 'dashboard' })
      return
    }
    draft.value = found

    const schemaResponse = await getRequestTypeForm(found.changeRequestType)
    formSchema.value = schemaResponse.formioSchema as { components: FormioComponent[] }
    initializeFormData(found.formData)
  } catch {
    notificationStore.showNotification(t('requestEdit.loadError'), 'error')
    router.push({ name: 'dashboard' })
  } finally {
    isLoading.value = false
  }
}

function handleUpdateFormData(val: Record<string, unknown>): void {
  for (const key of Object.keys(val)) {
    setFieldValue(key, val[key])
  }
}

async function handleReview(): Promise<void> {
  const valid = validateAll()
  if (!valid) {
    scrollToErrorSummary()
    return
  }

  // Save before navigating to review
  await saveNow()

  if (!draft.value) return

  // Store form data in Pinia store instead of URL query params
  formReviewStore.setReviewData(
    formData.value,
    draft.value.changeRequestType,
    draft.value.id,
  )

  router.push({
    name: 'request-review',
    query: {
      type: draft.value.changeRequestType,
      draftId: draft.value.id,
    },
  })
}

function scrollToErrorSummary(): void {
  const errorSummary = document.querySelector('[data-testid="error-summary"]')
  if (errorSummary) {
    errorSummary.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handleGoBack(): void {
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="portal-content">
    <div class="d-flex align-center mb-6">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        class="me-2"
        @click="handleGoBack"
      >
        {{ t('common.back') }}
      </v-btn>
      <h1 class="text-h5 font-weight-bold">
        {{ t('requestEdit.title') }}
      </h1>
    </div>

    <template v-if="isLoading">
      <LoadingSkeleton type="article" :count="2" />
    </template>

    <template v-else-if="draft && formSchema && inputComponents.length > 0">
      <!-- Auto-save status indicator -->
      <div class="d-flex align-center justify-end mb-4">
        <template v-if="saveStatus === 'saving'">
          <v-progress-circular
            size="16"
            width="2"
            indeterminate
            color="primary"
            class="me-2"
          />
          <span class="text-body-2 text-medium-emphasis">{{ t('autoSave.saving') }}</span>
        </template>
        <template v-else-if="saveStatus === 'saved'">
          <v-icon
            icon="mdi-check-circle-outline"
            size="16"
            color="success"
            class="me-1"
          />
          <span class="text-body-2 text-success">{{ t('autoSave.saved') }}</span>
        </template>
        <template v-else-if="saveStatus === 'error'">
          <v-icon
            icon="mdi-alert-circle-outline"
            size="16"
            color="error"
            class="me-1"
          />
          <span class="text-body-2 text-error me-2">{{ t('autoSave.error') }}</span>
          <v-btn
            size="small"
            variant="text"
            color="error"
            style="min-height: 48px; min-width: 48px"
            @click="saveNow"
          >
            {{ t('autoSave.retry') }}
          </v-btn>
        </template>
        <span
          v-else-if="lastSavedAt"
          class="text-body-2 text-medium-emphasis"
        >
          {{ t('autoSave.saved') }}
        </span>
      </div>

      <!-- Error summary -->
      <v-alert
        v-if="Object.keys(errors).length > 0"
        type="error"
        role="alert"
        rounded="lg"
        class="mb-4"
        data-testid="error-summary"
      >
        <p class="font-weight-medium mb-2">{{ t('form.errorSummary') }}</p>
        <ul class="ms-4">
          <li v-for="(message, key) in errors" :key="key">
            {{ message }}
          </li>
        </ul>
      </v-alert>

      <v-card rounded="lg" elevation="1" class="mb-6">
        <v-card-text class="pa-5">
          <ChangeRequestForm
            :components="formSchema.components"
            :model-value="formData"
            :errors="errors"
            :readonly="false"
            @update:model-value="handleUpdateFormData"
          />
        </v-card-text>
      </v-card>

      <v-btn
        color="primary"
        size="large"
        block
        prepend-icon="mdi-eye-outline"
        @click="handleReview"
      >
        {{ t('requestCreate.reviewButton') }}
      </v-btn>
    </template>

    <template v-else-if="!isLoading">
      <v-card rounded="lg" variant="outlined">
        <v-card-text class="text-center py-8">
          <p class="text-body-1 text-medium-emphasis">
            {{ t('requestEdit.loadError') }}
          </p>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>
