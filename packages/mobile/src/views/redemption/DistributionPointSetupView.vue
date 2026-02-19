<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '@/store/index'
import { useRedemptionStore } from '@/store/redemption'
import { useTenantStore } from '@/store/tenant'
import { useErrorHandler } from '@/composables/useErrorHandler'

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string

const redemptionStore = useRedemptionStore()
const tenantStore = useTenantStore()
const { handleError } = useErrorHandler(appId)

const isLoading = ref(false)
const isSyncing = ref(false)
const servicePoints = ref<Array<{ id: string; name: string }>>([])
const selectedPointId = ref<string | null>(null)
const searchFilter = ref('')
const showBindConfirm = ref(false)
const showUnbindConfirm = ref(false)
const bindConfirmMessage = ref('')

const filteredPoints = computed(() => {
  const term = searchFilter.value.trim().toLowerCase()
  if (!term) return servicePoints.value
  return servicePoints.value.filter(
    (p) => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term),
  )
})

onMounted(async () => {
  isLoading.value = true
  try {
    const config = await tenantStore.getTenant(appId)
    const entityDataList = (config as any)?.entityData ?? []
    const pointsDataset = entityDataList.find((d: any) => d.name === 'servicePoints')
    if (pointsDataset?.data) {
      servicePoints.value = Array.isArray(pointsDataset.data)
        ? pointsDataset.data
        : Object.values(pointsDataset.data as Record<string, { id: string; name: string }>)
    }
  } catch (err) {
    await handleError(err)
  } finally {
    isLoading.value = false
  }
})

const handleBind = () => {
  if (!selectedPointId.value) return
  const point = servicePoints.value.find((p) => p.id === selectedPointId.value)
  if (!point) return

  const isRebinding = redemptionStore.distributionPointId !== null
  if (isRebinding) {
    bindConfirmMessage.value = `Already bound to "${redemptionStore.distributionPointName}". Changing clears session data. Continue?`
  } else {
    bindConfirmMessage.value = `Bind to "${point.name}"?`
  }
  showBindConfirm.value = true
}

const confirmBind = async () => {
  showBindConfirm.value = false
  const point = servicePoints.value.find((p) => p.id === selectedPointId.value)
  if (!point) return

  isSyncing.value = true
  try {
    redemptionStore.bindDistributionPoint(point.id, point.name)
    await store.syncWithSyncServer()
    router.push(`/app/${appId}/redemption`)
  } catch (err) {
    await handleError(err)
  } finally {
    isSyncing.value = false
  }
}

const handleUnbind = () => {
  showUnbindConfirm.value = true
}

const confirmUnbind = () => {
  showUnbindConfirm.value = false
  redemptionStore.unbindDistributionPoint()
}

const goBack = () => {
  router.push(`/app/${appId}/redemption`)
}
</script>

<template>
  <div class="dist-point-setup">
    <header class="dist-point-setup__topbar">
      <button class="dist-point-setup__back-btn" aria-label="Go back" @click="goBack">
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
      <h1 class="dist-point-setup__title">Distribution Point Setup</h1>
      <div style="width: 48px"></div>
    </header>

    <div class="dist-point-setup__content">
      <!-- Current Binding -->
      <div
        v-if="redemptionStore.distributionPointId"
        class="dist-point-setup__current-binding"
        data-testid="current-binding"
      >
        <div class="dist-point-setup__binding-header">
          <span class="dist-point-setup__binding-label">Currently Bound</span>
          <button
            class="dist-point-setup__unbind-btn"
            data-testid="unbind-btn"
            @click="handleUnbind"
          >
            Unbind
          </button>
        </div>
        <div class="dist-point-setup__binding-name" data-testid="bound-point-name">
          {{ redemptionStore.distributionPointName }}
        </div>
        <div class="dist-point-setup__binding-stats">
          {{ redemptionStore.servedCount }} served / {{ redemptionStore.totalAllocated }} total
        </div>
        <div v-if="redemptionStore.sessionStartTime" class="dist-point-setup__binding-since">
          Since {{ new Date(redemptionStore.sessionStartTime).toLocaleString() }}
        </div>
      </div>

      <!-- Search Filter -->
      <div class="dist-point-setup__search-wrapper">
        <input
          v-model="searchFilter"
          class="dist-point-setup__search"
          type="search"
          placeholder="Filter distribution points…"
          data-testid="search-filter"
        />
      </div>

      <!-- Points List -->
      <div v-if="isLoading" class="dist-point-setup__loading">Loading points…</div>
      <div
        v-else-if="filteredPoints.length === 0"
        class="dist-point-setup__empty"
        data-testid="empty-message"
      >
        No distribution points found
      </div>
      <ul v-else class="dist-point-setup__points-list" role="list" data-testid="points-list">
        <li
          v-for="point in filteredPoints"
          :key="point.id"
          class="dist-point-setup__point-item"
          :class="{ 'dist-point-setup__point-item--selected': selectedPointId === point.id }"
          @click="selectedPointId = point.id"
        >
          <input
            :id="`point-${point.id}`"
            v-model="selectedPointId"
            type="radio"
            :value="point.id"
            class="dist-point-setup__radio"
          />
          <label :for="`point-${point.id}`" class="dist-point-setup__point-name">
            {{ point.name }}
          </label>
        </li>
      </ul>

      <!-- Bind Confirmation -->
      <div v-if="showBindConfirm" class="dist-point-setup__confirm-card" role="alertdialog">
        <p class="dist-point-setup__confirm-text">{{ bindConfirmMessage }}</p>
        <div class="dist-point-setup__confirm-actions">
          <button class="dist-point-setup__confirm-btn" type="button" @click="confirmBind">
            Confirm
          </button>
          <button class="dist-point-setup__cancel-btn" type="button" @click="showBindConfirm = false">
            Cancel
          </button>
        </div>
      </div>

      <!-- Unbind Confirmation -->
      <div v-if="showUnbindConfirm" class="dist-point-setup__confirm-card" role="alertdialog">
        <p class="dist-point-setup__confirm-text">Unbind from current distribution point?</p>
        <div class="dist-point-setup__confirm-actions">
          <button class="dist-point-setup__confirm-btn" type="button" @click="confirmUnbind">
            Confirm
          </button>
          <button class="dist-point-setup__cancel-btn" type="button" @click="showUnbindConfirm = false">
            Cancel
          </button>
        </div>
      </div>

      <!-- Bind Button -->
      <button
        class="dist-point-setup__bind-btn"
        :disabled="!selectedPointId || isSyncing"
        data-testid="bind-btn"
        @click="handleBind"
      >
        {{ isSyncing ? 'Syncing…' : 'Bind & Sync Entitlements' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dist-point-setup {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.dist-point-setup__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.dist-point-setup__back-btn {
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

.dist-point-setup__title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.dist-point-setup__content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dist-point-setup__current-binding {
  background: white;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  border-left: 4px solid #22c55e;
}

.dist-point-setup__binding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.dist-point-setup__binding-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #22c55e;
  font-weight: 600;
}

.dist-point-setup__unbind-btn {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #ef4444;
  background: transparent;
  color: #ef4444;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.dist-point-setup__binding-name {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.dist-point-setup__binding-stats {
  font-size: 14px;
  color: #475569;
  margin-top: 4px;
}

.dist-point-setup__binding-since {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.dist-point-setup__search-wrapper {
  position: relative;
}

.dist-point-setup__search {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  font-size: 15px;
  background: white;
  outline: none;
  box-sizing: border-box;
}

.dist-point-setup__loading,
.dist-point-setup__empty {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
  font-size: 14px;
}

.dist-point-setup__points-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dist-point-setup__point-item {
  background: white;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border: 2px solid transparent;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  transition: border-color 0.15s;
  min-height: 44px;
}

.dist-point-setup__point-item--selected {
  border-color: #2563eb;
}

.dist-point-setup__radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  accent-color: #2563eb;
}

.dist-point-setup__point-name {
  font-size: 15px;
  color: #0f172a;
  cursor: pointer;
}

.dist-point-setup__bind-btn {
  height: 52px;
  border-radius: 14px;
  border: none;
  background: #2563eb;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: auto;
  min-height: 44px;
}

.dist-point-setup__bind-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.dist-point-setup__confirm-card {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dist-point-setup__confirm-text {
  font-size: 14px;
  color: #92400e;
  font-weight: 600;
  margin: 0;
}

.dist-point-setup__confirm-actions {
  display: flex;
  gap: 12px;
}

.dist-point-setup__confirm-btn {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  border: none;
  background: #2563eb;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.dist-point-setup__cancel-btn {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  border: 2px solid #e5e7eb;
  background: transparent;
  color: #374151;
  font-weight: 600;
  cursor: pointer;
}
</style>
