<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useChangeRequestsStore } from '@/stores/changeRequests'
import StatusBadge from '@/components/StatusBadge.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import type { PortalRequest } from '@/types'

const { t, locale } = useI18n()
const router = useRouter()
const changeRequestsStore = useChangeRequestsStore()

const activeFilter = ref<string>('all')
const currentPage = ref(1)
const pageSize = 10

interface FilterTab {
  key: string
  label: string
  status?: string
}

const filterTabs: FilterTab[] = [
  { key: 'all', label: t('requestList.filterAll') },
  { key: 'pending', label: t('requestList.filterPending'), status: 'pending' },
  { key: 'revision', label: t('requestList.filterActionNeeded'), status: 'revision' },
  { key: 'approved', label: t('requestList.filterApproved'), status: 'approved' },
  { key: 'applied', label: t('requestList.filterCompleted'), status: 'applied' },
]

const totalPages = computed(() => Math.ceil(changeRequestsStore.total / pageSize))

onMounted(async () => {
  await fetchRequests()
})

async function fetchRequests(): Promise<void> {
  const activeTab = filterTabs.find((tab) => tab.key === activeFilter.value)
  await changeRequestsStore.fetchRequests({
    status: activeTab?.status,
    page: currentPage.value,
    pageSize,
  })
}

async function handleFilterChange(filterKey: string): Promise<void> {
  activeFilter.value = filterKey
  currentPage.value = 1
  await fetchRequests()
}

async function handlePageChange(page: number): Promise<void> {
  currentPage.value = page
  await fetchRequests()
}

function handleRequestClick(request: PortalRequest): void {
  router.push({ name: 'request-detail', params: { ref: request.reference } })
}

function handleNewRequest(): void {
  router.push({ name: 'request-create' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="portal-content">
    <div class="d-flex align-center justify-space-between mb-6">
      <h1 class="text-h5 font-weight-bold">
        {{ t('requestList.title') }}
      </h1>
    </div>

    <!-- Filter tabs -->
    <div class="mb-4">
      <v-tabs
        v-model="activeFilter"
        color="primary"
        @update:model-value="(val) => handleFilterChange(String(val))"
      >
        <v-tab
          v-for="tab in filterTabs"
          :key="tab.key"
          :value="tab.key"
        >
          {{ tab.label }}
        </v-tab>
      </v-tabs>
    </div>

    <!-- Loading state -->
    <template v-if="changeRequestsStore.isLoading">
      <LoadingSkeleton type="article" :count="3" />
    </template>

    <!-- Error state -->
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
        @click="fetchRequests"
      >
        {{ t('common.retry') }}
      </v-btn>
    </template>

    <template v-else>
      <!-- Empty state -->
      <template v-if="changeRequestsStore.requests.length === 0">
        <v-card
          rounded="lg"
          variant="outlined"
        >
          <v-card-text class="text-center py-12">
            <v-icon
              size="64"
              color="grey-lighten-1"
              icon="mdi-clipboard-list-outline"
              class="mb-4"
            />
            <p class="text-h6 text-medium-emphasis">
              {{ t('requestList.emptyState') }}
            </p>
          </v-card-text>
        </v-card>
      </template>

      <!-- Request list -->
      <template v-else>
        <div class="d-flex flex-column gap-3 mb-4">
          <v-card
            v-for="request in changeRequestsStore.requests"
            :key="request.reference"
            rounded="lg"
            variant="outlined"
            class="request-card"
            style="cursor: pointer"
            tabindex="0"
            role="button"
            :aria-label="request.typeLabel + ' — ' + request.reference"
            :data-testid="`request-card-${request.reference}`"
            @click="handleRequestClick(request)"
            @keydown.enter="handleRequestClick(request)"
            @keydown.space.prevent="handleRequestClick(request)"
          >
            <v-card-text class="pa-4">
              <div class="d-flex align-start justify-space-between">
                <div class="flex-grow-1 me-3">
                  <div class="d-flex align-center gap-2 mb-1 flex-wrap">
                    <span class="text-subtitle-2 font-weight-medium">
                      {{ request.typeLabel }}
                    </span>
                    <StatusBadge :status="request.status" />
                  </div>
                  <p class="text-caption text-medium-emphasis mb-0">
                    {{ request.reference }} &bull; {{ formatDate(request.updatedAt) }}
                  </p>
                </div>
                <v-icon
                  icon="mdi-chevron-right"
                  color="grey"
                />
              </div>
            </v-card-text>
          </v-card>
        </div>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          class="d-flex justify-center mt-4"
        >
          <v-pagination
            v-model="currentPage"
            :length="totalPages"
            rounded="circle"
            @update:model-value="handlePageChange"
          />
        </div>
      </template>
    </template>

    <!-- FAB button for new request -->
    <v-btn
      color="primary"
      size="large"
      icon="mdi-plus"
      position="fixed"
      location="bottom right"
      class="ma-6"
      elevation="3"
      :aria-label="t('requestList.newRequest')"
      :title="t('requestList.newRequest')"
      data-testid="new-request-fab"
      @click="handleNewRequest"
    />
  </div>
</template>
