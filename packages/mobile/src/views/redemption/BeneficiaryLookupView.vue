<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
import { store } from '@/store/index'
import { useRedemptionStore } from '@/store/redemption'
import { useErrorHandler } from '@/composables/useErrorHandler'

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string

const redemptionStore = useRedemptionStore()
const { handleError } = useErrorHandler(appId)

const searchTerm = ref('')
const debouncedSearchTerm = ref('')
const allEntities = ref<any[]>([])
const isLoading = ref(false)
const showScanInput = ref(false)
const scanValue = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const MAX_RESULTS = 20

const filteredResults = computed(() => {
  const term = debouncedSearchTerm.value.trim().toLowerCase()
  if (!term) return []
  return allEntities.value
    .filter((entity) => {
      const name = String(entity.data?.name ?? '').toLowerCase()
      const externalId = String(entity.data?.externalId ?? '').toLowerCase()
      return name.includes(term) || externalId.includes(term)
    })
    .slice(0, MAX_RESULTS)
})

const hasSearched = computed(() => debouncedSearchTerm.value.trim().length > 0)

onMounted(async () => {
  isLoading.value = true
  try {
    allEntities.value = await store.getAllEntities()
  } catch (err) {
    await handleError(err)
  } finally {
    isLoading.value = false
  }
})

const handleSearchInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearchTerm.value = searchTerm.value
  }, 300)
}

const goToConfirm = (entity: any) => {
  router.push(`/app/${appId}/redemption/beneficiary/${entity.guid}/confirm`)
}

const goBack = () => {
  router.push(`/app/${appId}/redemption`)
}

const handleScan = () => {
  showScanInput.value = true
}

const handleScanSubmit = () => {
  const guid = scanValue.value.trim()
  if (!guid) return
  scanValue.value = ''
  showScanInput.value = false
  router.push(`/app/${appId}/redemption/beneficiary/${guid}/confirm`)
}

const getHouseholdId = (entity: any): string => {
  return entity.data?.householdId ?? entity.data?.group ?? '—'
}
</script>

<template>
  <div class="beneficiary-lookup">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <header class="beneficiary-lookup__topbar">
      <button class="beneficiary-lookup__back-btn" aria-label="Go back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M12 15l-5-5 5-5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <h1 class="beneficiary-lookup__title">Search Beneficiary</h1>
      <div style="width: 48px"></div>
    </header>

    <div class="beneficiary-lookup__content">
      <div class="beneficiary-lookup__search-row">
        <input
          v-model="searchTerm"
          class="beneficiary-lookup__search-input"
          type="search"
          placeholder="Search by name or ID…"
          data-testid="search-input"
          @input="handleSearchInput"
        />
        <button class="beneficiary-lookup__scan-btn" aria-label="Scan" @click="handleScan">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5" />
            <rect
              x="13"
              y="2"
              width="5"
              height="5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <rect
              x="2"
              y="13"
              width="5"
              height="5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </div>

      <!-- Inline scan input -->
      <div v-if="showScanInput" class="beneficiary-lookup__scan-form">
        <input
          v-model="scanValue"
          class="beneficiary-lookup__scan-id-input"
          type="text"
          placeholder="Enter beneficiary ID or GUID"
          data-testid="scan-id-input"
          @keyup.enter="handleScanSubmit"
        />
        <div class="beneficiary-lookup__scan-actions">
          <button
            class="beneficiary-lookup__scan-go"
            type="button"
            @click="handleScanSubmit"
          >
            Go
          </button>
          <button
            class="beneficiary-lookup__scan-cancel"
            type="button"
            @click="showScanInput = false; scanValue = ''"
          >
            Cancel
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="beneficiary-lookup__loading">Loading…</div>
      <div
        v-else-if="hasSearched && filteredResults.length === 0"
        class="beneficiary-lookup__empty"
        data-testid="empty-message"
      >
        No matches found
      </div>
      <ul
        v-else-if="filteredResults.length > 0"
        class="beneficiary-lookup__results"
        role="list"
        data-testid="results-list"
      >
        <li
          v-for="entity in filteredResults"
          :key="entity.guid"
          class="beneficiary-lookup__result-item"
          @click="goToConfirm(entity)"
        >
          <div class="beneficiary-lookup__result-name">{{ entity.data?.name ?? 'Unknown' }}</div>
          <div class="beneficiary-lookup__result-meta">
            <span>ID: {{ entity.data?.externalId ?? '—' }}</span>
            <span>Household: {{ getHouseholdId(entity) }}</span>
          </div>
        </li>
      </ul>
      <p v-else class="beneficiary-lookup__hint">Type to search beneficiaries</p>
    </div>
  </div>
</template>

<style scoped>
.beneficiary-lookup {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.beneficiary-lookup__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.beneficiary-lookup__back-btn {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: white;
  display: grid;
  place-items: center;
  color: #64748b;
  cursor: pointer;
}

.beneficiary-lookup__title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.beneficiary-lookup__content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.beneficiary-lookup__search-row {
  display: flex;
  gap: 8px;
}

.beneficiary-lookup__search-input {
  flex: 1;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  font-size: 15px;
  background: white;
  outline: none;
}

.beneficiary-lookup__scan-btn {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: white;
  display: grid;
  place-items: center;
  color: #475569;
  cursor: pointer;
  flex-shrink: 0;
}

.beneficiary-lookup__loading,
.beneficiary-lookup__empty,
.beneficiary-lookup__hint {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
  font-size: 14px;
}

.beneficiary-lookup__results {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beneficiary-lookup__result-item {
  background: white;
  border-radius: 14px;
  padding: 14px 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  transition: transform 0.15s;
  min-height: 44px;
}

.beneficiary-lookup__result-item:active {
  transform: scale(0.99);
}

.beneficiary-lookup__result-name {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.beneficiary-lookup__result-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.beneficiary-lookup__scan-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beneficiary-lookup__scan-id-input {
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  border: 2px solid #2563eb;
  font-size: 15px;
  outline: none;
}

.beneficiary-lookup__scan-actions {
  display: flex;
  gap: 8px;
}

.beneficiary-lookup__scan-go {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  border: none;
  background: #22c55e;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.beneficiary-lookup__scan-cancel {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: white;
  color: #475569;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
</style>
