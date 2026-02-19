<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '@/stores/notification'
import { useDraftsStore } from '@/stores/drafts'
import { useFormReviewStore } from '@/stores/formReview'
import { getRequestTypes, getRequestTypeForm } from '@/api/changeRequests'
import { useFormio, type FormioComponent } from '@/composables/useFormio'
import { useAutoSave } from '@/composables/useAutoSave'
import ChangeRequestForm from '@/components/ChangeRequestForm.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import type { RequestType } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const notificationStore = useNotificationStore()
const draftsStore = useDraftsStore()
const formReviewStore = useFormReviewStore()

const requestTypes = ref<RequestType[]>([])
const isLoadingTypes = ref(false)
const isLoadingForm = ref(false)

const selectedTypeCode = computed(() => route.query.type as string | undefined)
const step = computed(() => (route.query.step as string | undefined) ?? 'type')
const draftId = computed(() => route.query.draftId as string | undefined)

const selectedType = computed(() =>
  requestTypes.value.find((rt) => rt.code === selectedTypeCode.value),
)

const formSchema = ref<{ components: FormioComponent[] } | null>(null)

const { formData, errors, inputComponents, setFieldValue, validateAll, resetForm, initializeFormData } =
  useFormio(formSchema)

// The current draft ID being worked on (may come from query param or be created on first save)
const activeDraftId = ref<string | null>(null)

const { saveStatus, lastSavedAt, saveNow, reset: resetAutoSave } = useAutoSave(
  formData,
  async (data) => {
    const typeCode = selectedTypeCode.value
    if (!typeCode || !activeDraftId.value) return
    await draftsStore.saveDraft(activeDraftId.value, typeCode, data)
  },
  { debounceMs: 5000, maxRetries: 3 },
)

const formDataModel = computed({
  get: () => formData.value,
  set: (val) => {
    for (const key of Object.keys(val)) {
      setFieldValue(key, val[key])
    }
  },
})

onMounted(async () => {
  await loadRequestTypes()

  // If a draft is being continued, load its data
  if (draftId.value) {
    activeDraftId.value = draftId.value
    await loadDraftData(draftId.value)
  }

  // If a type is already selected via query params on initial mount, load its schema
  if (selectedTypeCode.value && !draftId.value) {
    await loadFormSchema(selectedTypeCode.value)
  }
})

watch(selectedTypeCode, async (newCode, oldCode) => {
  // Only react to actual changes (not the initial undefined → undefined non-change)
  if (newCode === oldCode) return
  if (newCode) {
    resetAutoSave()
    activeDraftId.value = crypto.randomUUID()
    await loadFormSchema(newCode)
  } else {
    formSchema.value = null
    resetForm()
    resetAutoSave()
    activeDraftId.value = null
  }
})

async function loadDraftData(id: string): Promise<void> {
  try {
    if (draftsStore.drafts.length === 0) {
      await draftsStore.fetchDrafts()
    }
    const draft = draftsStore.drafts.find((d) => d.id === id)
    if (draft) {
      initializeFormData(draft.formData)
    }
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  }
}

async function loadRequestTypes(): Promise<void> {
  isLoadingTypes.value = true
  try {
    requestTypes.value = await getRequestTypes()
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isLoadingTypes.value = false
  }
}

async function loadFormSchema(typeCode: string): Promise<void> {
  isLoadingForm.value = true
  formSchema.value = null
  if (!draftId.value) {
    resetForm()
  }
  try {
    const response = await getRequestTypeForm(typeCode)
    formSchema.value = response.formioSchema as { components: FormioComponent[] }
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isLoadingForm.value = false
  }
}

function selectType(code: string): void {
  const newDraftId = crypto.randomUUID()
  activeDraftId.value = newDraftId
  router.push({ name: 'request-create', query: { type: code, step: 'form', draftId: newDraftId } })
}

async function handleReview(): Promise<void> {
  const valid = validateAll()
  if (!valid) {
    scrollToErrorSummary()
    return
  }

  // Save current state before navigating to review
  await saveNow()

  // Store form data in Pinia store instead of URL query params
  formReviewStore.setReviewData(
    formData.value,
    selectedTypeCode.value ?? '',
    activeDraftId.value ?? undefined,
  )

  router.push({
    name: 'request-review',
    query: {
      type: selectedTypeCode.value,
      draftId: activeDraftId.value ?? undefined,
    },
  })
}

function scrollToErrorSummary(): void {
  const errorSummary = document.querySelector('[data-testid="error-summary"]')
  if (errorSummary) {
    errorSummary.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handleUpdateFormData(val: Record<string, unknown>): void {
  for (const key of Object.keys(val)) {
    setFieldValue(key, val[key])
  }
}

function getTypeIcon(type: RequestType): string {
  return type.icon ?? 'mdi-file-document-outline'
}
</script>

<template>
  <div class="portal-content">
    <h1 class="text-h5 font-weight-bold mb-6">
      {{ t('requestCreate.pageTitle') }}
    </h1>

    <!-- Type Selection Step -->
    <template v-if="!selectedTypeCode || step === 'type'">
      <p class="text-body-1 text-medium-emphasis mb-6">
        {{ t('requestCreate.typeSelectionHint') }}
      </p>

      <template v-if="isLoadingTypes">
        <LoadingSkeleton type="card" :count="3" />
      </template>

      <template v-else-if="requestTypes.length === 0">
        <v-card rounded="lg" variant="outlined">
          <v-card-text class="text-center py-12">
            <v-icon
              size="64"
              color="grey-lighten-1"
              icon="mdi-clipboard-off-outline"
              class="mb-4"
            />
            <p class="text-body-1 text-medium-emphasis">
              {{ t('requestCreate.noTypesAvailable') }}
            </p>
          </v-card-text>
        </v-card>
      </template>

      <template v-else>
        <p class="text-subtitle-1 font-weight-medium mb-4">
          {{ t('requestCreate.selectType') }}
        </p>
        <v-row>
          <v-col
            v-for="type in requestTypes"
            :key="type.code"
            cols="12"
            sm="6"
          >
            <v-card
              rounded="lg"
              hover
              class="h-100"
              style="cursor: pointer"
              tabindex="0"
              role="button"
              :aria-label="type.label"
              @click="selectType(type.code)"
              @keydown.enter="selectType(type.code)"
              @keydown.space.prevent="selectType(type.code)"
            >
              <v-card-text class="pa-5">
                <div class="d-flex align-center mb-3">
                  <v-icon
                    :icon="getTypeIcon(type)"
                    size="32"
                    color="primary"
                    class="me-3"
                  />
                  <span class="text-subtitle-1 font-weight-medium">{{ type.label }}</span>
                </div>
                <p class="text-body-2 text-medium-emphasis">
                  {{ type.description }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </template>
    </template>

    <!-- Form Step -->
    <template v-else-if="step === 'form'">
      <div class="d-flex align-center mb-6">
        <v-btn
          variant="text"
          prepend-icon="mdi-arrow-left"
          class="me-2"
          @click="router.push({ name: 'request-create' })"
        >
          {{ t('common.back') }}
        </v-btn>
        <h2 class="text-subtitle-1 font-weight-medium">
          {{ selectedType?.label }}
        </h2>
      </div>

      <!-- Auto-save status indicator -->
      <div
        v-if="activeDraftId"
        class="d-flex align-center justify-end mb-4"
      >
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

      <template v-if="isLoadingForm">
        <LoadingSkeleton type="article" :count="2" />
        <p class="text-body-2 text-medium-emphasis text-center mt-4">
          {{ t('requestCreate.loadingForm') }}
        </p>
      </template>

      <template v-else-if="formSchema && inputComponents.length > 0">
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
            <p class="text-subtitle-1 font-weight-medium mb-4">
              {{ t('requestCreate.formStep') }}
            </p>
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

      <template v-else-if="!isLoadingForm">
        <v-card rounded="lg" variant="outlined">
          <v-card-text class="text-center py-8">
            <p class="text-body-1 text-medium-emphasis">
              {{ t('errors.generic') }}
            </p>
          </v-card-text>
        </v-card>
      </template>
    </template>
  </div>
</template>
