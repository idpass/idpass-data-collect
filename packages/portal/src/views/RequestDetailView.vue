<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChangeRequestsStore } from '@/stores/changeRequests'
import { submitRequest, resetRequest } from '@/api/requests'
import { useNotificationStore } from '@/stores/notification'
import StatusBadge from '@/components/StatusBadge.vue'
import StatusTimeline from '@/components/StatusTimeline.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const changeRequestsStore = useChangeRequestsStore()
const notificationStore = useNotificationStore()

const isSubmitting = ref(false)

const ref_ = computed(() => route.params.ref as string)

const request = computed(() => changeRequestsStore.currentRequest)

const revisionMessage = computed(() => {
  if (!request.value || request.value.status !== 'revision') return null
  const lastRevisionEntry = [...(request.value.history ?? [])]
    .reverse()
    .find((entry) => entry.status === 'revision')
  return lastRevisionEntry?.message ?? null
})

onMounted(async () => {
  await changeRequestsStore.fetchRequestDetail(ref_.value)
})

onBeforeUnmount(() => {
  changeRequestsStore.clearCurrentRequest()
})

async function handleSubmit(): Promise<void> {
  if (!request.value) return
  isSubmitting.value = true
  try {
    await submitRequest(request.value.reference)
    notificationStore.showNotification(t('requestDetail.submitSuccess', 'Request submitted successfully.'), 'success')
    await changeRequestsStore.fetchRequestDetail(ref_.value)
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isSubmitting.value = false
  }
}

async function handleReset(): Promise<void> {
  if (!request.value) return
  isSubmitting.value = true
  try {
    await resetRequest(request.value.reference)
    notificationStore.showNotification(t('requestDetail.resetSuccess', 'Request reset to draft successfully.'), 'success')
    await changeRequestsStore.fetchRequestDetail(ref_.value)
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isSubmitting.value = false
  }
}

function handleEditAndResubmit(): void {
  if (!request.value) return
  router.push({ name: 'request-edit', query: { ref: request.value.reference } })
}

function handleEdit(): void {
  if (!request.value) return
  router.push({ name: 'request-edit', query: { ref: request.value.reference } })
}

function handleBack(): void {
  router.push({ name: 'requests' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="portal-content">
    <div class="d-flex align-center mb-4">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        @click="handleBack"
      >
        {{ t('common.back') }}
      </v-btn>
    </div>

    <template v-if="changeRequestsStore.isLoading">
      <LoadingSkeleton type="article" :count="3" />
    </template>

    <template v-else-if="changeRequestsStore.error">
      <v-alert
        type="error"
        rounded="lg"
        class="mb-4"
      >
        {{ changeRequestsStore.error }}
      </v-alert>
      <v-btn
        color="primary"
        @click="changeRequestsStore.fetchRequestDetail(ref_)"
      >
        {{ t('common.retry') }}
      </v-btn>
    </template>

    <template v-else-if="request">
      <!-- Header card -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-text class="pa-4">
          <h1 class="text-h6 font-weight-bold mb-2">
            {{ request.typeLabel }}
          </h1>
          <div class="d-flex align-center gap-3 mb-3 flex-wrap">
            <span class="text-body-2 text-medium-emphasis">
              <strong>{{ t('requestDetail.reference') }}:</strong>
              {{ request.reference }}
            </span>
            <StatusBadge :status="request.status" />
          </div>
          <div class="d-flex gap-4 flex-wrap">
            <span class="text-caption text-medium-emphasis">
              {{ t('requestDetail.createdAt') }}: {{ formatDate(request.createdAt) }}
            </span>
            <span
              v-if="request.submittedAt"
              class="text-caption text-medium-emphasis"
            >
              {{ t('requestDetail.submittedAt') }}: {{ formatDate(request.submittedAt) }}
            </span>
          </div>
        </v-card-text>
      </v-card>

      <!-- Revision comments for revision status -->
      <v-alert
        v-if="request.status === 'revision'"
        type="warning"
        rounded="lg"
        class="mb-4"
        icon="mdi-alert-circle-outline"
      >
        <p class="font-weight-medium mb-1">
          {{ t('requestDetail.revisionComments') }}
        </p>
        <p
          v-if="revisionMessage"
          class="text-body-2"
          data-testid="revision-message"
        >
          {{ revisionMessage }}
        </p>
      </v-alert>

      <!-- Action buttons -->
      <div
        v-if="request.status === 'draft' || request.status === 'revision'"
        class="d-flex gap-2 mb-4 flex-wrap"
      >
        <v-btn
          v-if="request.status === 'draft'"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-pencil-outline"
          :disabled="isSubmitting"
          data-testid="edit-btn"
          @click="handleEdit"
        >
          {{ t('requestDetail.edit') }}
        </v-btn>
        <v-btn
          v-if="request.status === 'draft'"
          color="primary"
          variant="elevated"
          prepend-icon="mdi-send-outline"
          :loading="isSubmitting"
          data-testid="submit-btn"
          @click="handleSubmit"
        >
          {{ t('requestDetail.submit') }}
        </v-btn>
        <v-btn
          v-if="request.status === 'revision'"
          color="warning"
          variant="elevated"
          prepend-icon="mdi-pencil-outline"
          :disabled="isSubmitting"
          data-testid="edit-resubmit-btn"
          @click="handleEditAndResubmit"
        >
          {{ t('requestDetail.editAndResubmit') }}
        </v-btn>
      </div>

      <!-- History timeline -->
      <v-card
        v-if="request.history && request.history.length > 0"
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ t('requestDetail.history') }}
        </v-card-title>
        <v-card-text class="pt-0">
          <StatusTimeline :history="request.history" />
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>
