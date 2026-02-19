<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useDraftsStore } from '@/stores/drafts'
import { useChangeRequestsStore } from '@/stores/changeRequests'
import { useNotificationStore } from '@/stores/notification'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import DraftCard from '@/components/DraftCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type { PortalDraft } from '@/types'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const draftsStore = useDraftsStore()
const changeRequestsStore = useChangeRequestsStore()
const notificationStore = useNotificationStore()

const isLoading = ref(true)
const showDeleteConfirmDialog = ref(false)
const pendingDeleteDraftId = ref<string | null>(null)

const recentRequests = computed(() => changeRequestsStore.requests.slice(0, 3))

const statusCounts = computed(() => {
  const byStatus = changeRequestsStore.requestsByStatus
  return {
    pending: byStatus['pending']?.length ?? 0,
    revision: byStatus['revision']?.length ?? 0,
    approved: byStatus['approved']?.length ?? 0,
  }
})

onMounted(async () => {
  await Promise.all([draftsStore.fetchDrafts(), changeRequestsStore.fetchRequests({ pageSize: 10 })])
  isLoading.value = false
})

function handleNewRequest(): void {
  router.push({ name: 'request-create' })
}

function handleEditDraft(draft: PortalDraft): void {
  router.push({ name: 'request-edit', query: { draftId: draft.id } })
}

function handleDeleteDraft(draftId: string): void {
  pendingDeleteDraftId.value = draftId
  showDeleteConfirmDialog.value = true
}

async function confirmDeleteDraft(): Promise<void> {
  if (!pendingDeleteDraftId.value) return
  try {
    await draftsStore.removeDraft(pendingDeleteDraftId.value)
    notificationStore.showNotification(t('drafts.deleteSuccess'), 'success')
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    showDeleteConfirmDialog.value = false
    pendingDeleteDraftId.value = null
  }
}

function cancelDeleteDraft(): void {
  showDeleteConfirmDialog.value = false
  pendingDeleteDraftId.value = null
}

function navigateToRequestDetail(reference: string): void {
  router.push({ name: 'request-detail', params: { ref: reference } })
}
</script>

<template>
  <div class="portal-content">
    <h1 class="text-h5 font-weight-bold mb-6">
      {{ t('dashboard.greeting', { name: authStore.displayName || '' }) }}
    </h1>

    <template v-if="isLoading">
      <LoadingSkeleton type="article" :count="2" />
    </template>

    <template v-else>
      <!-- Drafts Section -->
      <section class="mb-6">
        <h2 class="text-h6 font-weight-medium mb-3">
          {{ t('dashboard.draftsTitle') }}
        </h2>

        <template v-if="draftsStore.drafts.length === 0">
          <v-card rounded="lg" variant="outlined">
            <v-card-text class="text-center py-8">
              <v-icon
                size="48"
                color="grey-lighten-1"
                icon="mdi-file-outline"
                class="mb-3"
              />
              <p class="text-body-1 text-medium-emphasis">
                {{ t('dashboard.draftsEmpty') }}
              </p>
            </v-card-text>
          </v-card>
        </template>

        <template v-else>
          <div class="d-flex flex-column gap-3">
            <DraftCard
              v-for="draft in draftsStore.drafts"
              :key="draft.id"
              :draft="draft"
              @edit="handleEditDraft"
              @delete="handleDeleteDraft"
            />
          </div>
        </template>
      </section>

      <!-- Recent Requests Section -->
      <section class="mb-6">
        <div class="d-flex align-center justify-space-between mb-3">
          <h2 class="text-h6 font-weight-medium">
            {{ t('dashboard.requestsTitle') }}
          </h2>
          <v-btn
            variant="text"
            color="primary"
            style="min-height: 48px"
            :to="{ name: 'requests' }"
          >
            {{ t('dashboard.viewAllRequests') }}
          </v-btn>
        </div>

        <!-- Status summary chips -->
        <div
          v-if="changeRequestsStore.total > 0"
          class="d-flex gap-2 mb-3 flex-wrap"
        >
          <v-chip
            v-if="statusCounts.pending > 0"
            color="blue"
            size="small"
            variant="tonal"
            prepend-icon="mdi-clock-outline"
          >
            {{ statusCounts.pending }} {{ t('status.pending') }}
          </v-chip>
          <v-chip
            v-if="statusCounts.revision > 0"
            color="orange"
            size="small"
            variant="tonal"
            prepend-icon="mdi-alert-circle-outline"
          >
            {{ statusCounts.revision }} {{ t('status.revision') }}
          </v-chip>
          <v-chip
            v-if="statusCounts.approved > 0"
            color="green"
            size="small"
            variant="tonal"
            prepend-icon="mdi-check-circle-outline"
          >
            {{ statusCounts.approved }} {{ t('status.approved') }}
          </v-chip>
        </div>

        <template v-if="recentRequests.length === 0">
          <v-card rounded="lg" variant="outlined">
            <v-card-text class="text-center py-8">
              <v-icon
                size="48"
                color="grey-lighten-1"
                icon="mdi-clipboard-list-outline"
                class="mb-3"
              />
              <p class="text-body-1 text-medium-emphasis">
                {{ t('dashboard.requestsEmpty') }}
              </p>
            </v-card-text>
          </v-card>
        </template>

        <template v-else>
          <div class="d-flex flex-column gap-2">
            <v-card
              v-for="request in recentRequests"
              :key="request.reference"
              rounded="lg"
              variant="outlined"
              style="cursor: pointer"
              tabindex="0"
              role="button"
              :aria-label="request.typeLabel + ' — ' + request.reference"
              @click="navigateToRequestDetail(request.reference)"
              @keydown.enter="navigateToRequestDetail(request.reference)"
              @keydown.space.prevent="navigateToRequestDetail(request.reference)"
            >
              <v-card-text class="pa-3">
                <div class="d-flex align-center justify-space-between">
                  <div class="flex-grow-1 me-2">
                    <span class="text-subtitle-2 font-weight-medium">
                      {{ request.typeLabel }}
                    </span>
                    <p class="text-caption text-medium-emphasis mb-0">
                      {{ request.reference }}
                    </p>
                  </div>
                  <StatusBadge :status="request.status" />
                </div>
              </v-card-text>
            </v-card>
          </div>
        </template>
      </section>

      <!-- Quick Actions Section -->
      <section>
        <h2 class="text-h6 font-weight-medium mb-3">
          {{ t('dashboard.quickActions') }}
        </h2>
        <v-btn
          color="primary"
          size="large"
          block
          prepend-icon="mdi-plus-circle-outline"
          @click="handleNewRequest"
        >
          {{ t('dashboard.newRequest') }}
        </v-btn>
      </section>
    </template>

    <!-- Delete Confirmation Dialog -->
    <v-dialog
      v-model="showDeleteConfirmDialog"
      max-width="400"
    >
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          <h2 class="text-subtitle-1 font-weight-medium">
            {{ t('drafts.delete') }}
          </h2>
        </v-card-title>
        <v-card-text
          id="delete-dialog-body"
          class="pa-4 pt-2"
        >
          {{ t('drafts.deleteConfirm') }}
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn
            variant="text"
            @click="cancelDeleteDraft"
          >
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            @click="confirmDeleteDraft"
          >
            {{ t('drafts.delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
