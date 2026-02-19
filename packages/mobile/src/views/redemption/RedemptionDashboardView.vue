<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
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
const appName = ref('')
const pendingSync = ref(0)
const scanInput = ref('')
const showScanInput = ref(false)

const recentActivity = computed(() =>
  [...redemptionStore.sessionRedemptions].reverse().slice(0, 10),
)

onMounted(async () => {
  isLoading.value = true
  try {
    redemptionStore.initialize()
    const config = await tenantStore.getTenant(appId)
    appName.value = (config as any)?.name ?? appId
    const entities = await store.getAllEntities()
    pendingSync.value = await store.getUnsyncedEventsCount()
    redemptionStore.refreshSessionStats(
      entities.map((e: any) => ({
        entitlements: e.modified?.data?.entitlements ?? e.data?.entitlements,
      })),
    )
  } catch (err) {
    await handleError(err)
  } finally {
    isLoading.value = false
  }
})

const handleSync = async () => {
  isSyncing.value = true
  try {
    await store.syncWithSyncServer()
    pendingSync.value = await store.getUnsyncedEventsCount()
    const entities = await store.getAllEntities()
    redemptionStore.refreshSessionStats(
      entities.map((e: any) => ({
        entitlements: e.modified?.data?.entitlements ?? e.data?.entitlements,
      })),
    )
  } catch (err) {
    await handleError(err)
  } finally {
    isSyncing.value = false
  }
}

const handleGoBack = () => {
  router.push('/')
}

const handleScanSubmit = () => {
  const guid = scanInput.value.trim()
  if (!guid) return
  scanInput.value = ''
  showScanInput.value = false
  router.push(`/app/${appId}/redemption/beneficiary/${guid}/confirm`)
}

const goToLookup = () => {
  router.push(`/app/${appId}/redemption/lookup`)
}

const goToSetup = () => {
  router.push(`/app/${appId}/redemption/setup`)
}

const goToSummary = () => {
  router.push(`/app/${appId}/redemption/summary`)
}

const goToReceipt = (receiptNumber: string, entityGuid: string) => {
  router.push(`/app/${appId}/redemption/beneficiary/${entityGuid}/receipt/${receiptNumber}`)
}
</script>

<template>
  <div class="redemption-dashboard">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <header class="redemption-dashboard__topbar">
      <button class="redemption-dashboard__back-btn" aria-label="Go back" @click="handleGoBack">
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
      <div class="redemption-dashboard__actions">
        <button
          class="redemption-dashboard__pill-btn"
          :disabled="isSyncing"
          @click="handleSync"
        >
          {{ isSyncing ? 'Syncing…' : 'Sync' }}
        </button>
      </div>
    </header>

    <div class="redemption-dashboard__content">
      <!-- Hero Card -->
      <div class="redemption-dashboard__hero" data-testid="hero-card">
        <div class="redemption-dashboard__app-name">{{ appName }}</div>
        <div
          v-if="redemptionStore.distributionPointName"
          class="redemption-dashboard__point"
          data-testid="distribution-point-name"
        >
          {{ redemptionStore.distributionPointName }}
        </div>
        <div v-else class="redemption-dashboard__point redemption-dashboard__point--unset">
          No distribution point bound
        </div>
        <span
          class="redemption-dashboard__mode-pill"
          :class="
            redemptionStore.mode === 'offline'
              ? 'redemption-dashboard__mode-pill--offline'
              : 'redemption-dashboard__mode-pill--online'
          "
          data-testid="mode-indicator"
        >
          {{ redemptionStore.mode === 'offline' ? 'Offline Mode' : 'Online Mode' }}
        </span>
      </div>

      <!-- Stats Row -->
      <div class="redemption-dashboard__stats" data-testid="stats-row">
        <div class="redemption-dashboard__stat">
          <span class="redemption-dashboard__stat-value" data-testid="served-count">{{
            redemptionStore.servedCount
          }}</span>
          <span class="redemption-dashboard__stat-label">Served</span>
        </div>
        <div class="redemption-dashboard__stat">
          <span class="redemption-dashboard__stat-value" data-testid="pending-sync">{{
            pendingSync
          }}</span>
          <span class="redemption-dashboard__stat-label">Pending Sync</span>
        </div>
        <div class="redemption-dashboard__stat">
          <span class="redemption-dashboard__stat-value">0</span>
          <span class="redemption-dashboard__stat-label">Voids</span>
        </div>
      </div>

      <!-- Scan Beneficiary -->
      <div class="redemption-dashboard__scan-section">
        <button
          v-if="!showScanInput"
          class="redemption-dashboard__btn redemption-dashboard__btn--primary"
          data-testid="scan-btn"
          @click="showScanInput = true"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            style="margin-right: 8px"
          >
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
          Scan Beneficiary
        </button>
        <div v-else class="redemption-dashboard__scan-input-row">
          <input
            v-model="scanInput"
            class="redemption-dashboard__scan-input"
            type="text"
            placeholder="Enter beneficiary ID or GUID"
            data-testid="scan-input"
            autofocus
            @keyup.enter="handleScanSubmit"
          />
          <button
            class="redemption-dashboard__btn redemption-dashboard__btn--primary"
            style="flex-shrink: 0"
            data-testid="scan-go-btn"
            @click="handleScanSubmit"
          >
            Go
          </button>
          <button
            class="redemption-dashboard__btn redemption-dashboard__btn--secondary"
            style="flex-shrink: 0"
            @click="showScanInput = false; scanInput = ''"
          >
            Cancel
          </button>
        </div>
        <button
          class="redemption-dashboard__btn redemption-dashboard__btn--secondary"
          data-testid="lookup-btn"
          @click="goToLookup"
        >
          Search by Name / ID
        </button>
      </div>

      <!-- Quick Actions -->
      <div class="redemption-dashboard__quick-actions">
        <button
          class="redemption-dashboard__quick-btn"
          data-testid="setup-btn"
          @click="goToSetup"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          Setup Dist Point
        </button>
        <button
          class="redemption-dashboard__quick-btn"
          data-testid="summary-btn"
          @click="goToSummary"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
            <line
              x1="7"
              y1="8"
              x2="13"
              y2="8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <line
              x1="7"
              y1="11"
              x2="13"
              y2="11"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <line
              x1="7"
              y1="14"
              x2="10"
              y2="14"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          End of Day Summary
        </button>
      </div>

      <!-- Recent Activity -->
      <section class="redemption-dashboard__activity" aria-labelledby="activity-heading">
        <h2 id="activity-heading" class="redemption-dashboard__section-title">Recent Activity</h2>
        <p v-if="recentActivity.length === 0" class="redemption-dashboard__empty">
          No activity yet
        </p>
        <ul
          v-else
          class="redemption-dashboard__activity-list"
          role="list"
          data-testid="activity-list"
        >
          <li
            v-for="item in recentActivity"
            :key="item.receiptNumber"
            class="redemption-dashboard__activity-item"
            @click="goToReceipt(item.receiptNumber, item.entityGuid)"
          >
            <div class="redemption-dashboard__activity-receipt">{{ item.receiptNumber }}</div>
            <div class="redemption-dashboard__activity-time">
              {{ new Date(item.timestamp).toLocaleTimeString() }}
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.redemption-dashboard {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.redemption-dashboard__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.redemption-dashboard__back-btn {
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

.redemption-dashboard__actions {
  display: flex;
  gap: 8px;
}

.redemption-dashboard__pill-btn {
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: white;
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}

.redemption-dashboard__pill-btn:disabled {
  opacity: 0.5;
}

.redemption-dashboard__content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.redemption-dashboard__hero {
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.redemption-dashboard__app-name {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.redemption-dashboard__point {
  font-size: 15px;
  color: #475569;
}

.redemption-dashboard__point--unset {
  color: #94a3b8;
  font-style: italic;
}

.redemption-dashboard__mode-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
}

.redemption-dashboard__mode-pill--online {
  background: #dcfce7;
  color: #166534;
}

.redemption-dashboard__mode-pill--offline {
  background: #fef3c7;
  color: #92400e;
}

.redemption-dashboard__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.redemption-dashboard__stat {
  background: white;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.redemption-dashboard__stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.redemption-dashboard__stat-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.redemption-dashboard__scan-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.redemption-dashboard__scan-input-row {
  display: flex;
  gap: 8px;
}

.redemption-dashboard__scan-input {
  flex: 1;
  height: 52px;
  padding: 0 16px;
  border-radius: 14px;
  border: 2px solid #2563eb;
  font-size: 15px;
  outline: none;
}

.redemption-dashboard__btn {
  height: 52px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  min-height: 44px;
}

.redemption-dashboard__btn--primary {
  background: #22c55e;
  color: white;
  width: 100%;
}

.redemption-dashboard__btn--secondary {
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
  width: 100%;
}

.redemption-dashboard__quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.redemption-dashboard__quick-btn {
  background: white;
  border-radius: 18px;
  border: none;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  min-height: 44px;
}

.redemption-dashboard__section-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 12px;
}

.redemption-dashboard__empty {
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
  padding: 16px;
}

.redemption-dashboard__activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.redemption-dashboard__activity-item {
  background: white;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  cursor: pointer;
  min-height: 44px;
}

.redemption-dashboard__activity-receipt {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  font-family: monospace;
}

.redemption-dashboard__activity-time {
  font-size: 12px;
  color: #94a3b8;
}
</style>
