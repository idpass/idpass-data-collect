<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '@/store'
import { useRedemptionStore } from '@/store/redemption'

interface RedemptionEntry {
  guid: string
  receiptNumber: string
  entitlementId: string
  redemptionType: 'quantity' | 'monetary'
  quantity?: number
  amount?: number
  timestamp: string
  status: 'active' | 'voided'
  programName?: string
  syncLevel?: number
}

interface ProgramStat {
  programName: string
  allocated: number
  redeemed: number
  voided: number
}

const route = useRoute()
const router = useRouter()
const redemptionStore = useRedemptionStore()

const appId = route.params.id as string

const allRedemptions = ref<RedemptionEntry[]>([])
const programAllocations = ref<Map<string, number>>(new Map())
const unsyncedCount = ref(0)
const syncedCount = ref(0)
const isSyncing = ref(false)
const syncError = ref('')
const showCloseWarning = ref(false)

const sessionDate = computed(() => {
  if (redemptionStore.sessionStartTime) {
    return new Date(redemptionStore.sessionStartTime).toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  return new Date().toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

const totalRedemptions = computed(
  () => allRedemptions.value.filter((r) => r.status !== 'voided').length,
)

const totalVoided = computed(() => allRedemptions.value.filter((r) => r.status === 'voided').length)

const voidRate = computed(() => {
  const total = allRedemptions.value.length
  if (total === 0) return 0
  return (totalVoided.value / total) * 100
})

const hasHighVoidRate = computed(() => voidRate.value > 5)

const unservedCount = computed(
  () => redemptionStore.totalAllocated - redemptionStore.servedCount,
)

const programStats = computed<ProgramStat[]>(() => {
  const stats = new Map<string, ProgramStat>()

  // Seed stats with allocation data from entitlements
  for (const [name, allocated] of programAllocations.value) {
    stats.set(name, { programName: name, allocated, redeemed: 0, voided: 0 })
  }

  // Merge in redemption counts
  for (const entry of allRedemptions.value) {
    const name = entry.programName ?? 'Unknown Program'
    if (!stats.has(name)) {
      stats.set(name, { programName: name, allocated: 0, redeemed: 0, voided: 0 })
    }
    const stat = stats.get(name)!
    if (entry.status === 'voided') {
      stat.voided++
    } else {
      stat.redeemed++
    }
  }
  return Array.from(stats.values())
})

const lastSyncDisplay = computed(() => {
  if (!redemptionStore.lastSyncTime) return 'Never'
  return new Date(redemptionStore.lastSyncTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

onMounted(async () => {
  const [entities, unsynced] = await Promise.all([
    store.getAllEntities(),
    store.getUnsyncedEventsCount(),
  ])

  unsyncedCount.value = unsynced

  // Collect all redemption history and entitlement allocations across entities
  const redemptions: RedemptionEntry[] = []
  const allocations = new Map<string, number>()
  for (const entity of entities) {
    const data = (entity as { data: Record<string, unknown> }).data || {}
    const history: RedemptionEntry[] = Array.isArray(data.redemptionHistory)
      ? (data.redemptionHistory as RedemptionEntry[])
      : []
    redemptions.push(...history)

    // Collect per-program allocation totals from entitlements
    const entitlements = Array.isArray(data.entitlements)
      ? (data.entitlements as Array<{ programName?: string; allocated?: number }>)
      : []
    for (const ent of entitlements) {
      const programName = ent.programName ?? 'Unknown Program'
      const current = allocations.get(programName) ?? 0
      allocations.set(programName, current + (ent.allocated ?? 0))
    }
  }
  allRedemptions.value = redemptions
  programAllocations.value = allocations

  // Refresh session stats
  redemptionStore.refreshSessionStats(
    entities.map((e: { data: Record<string, unknown> }) => ({
      entitlements: Array.isArray(e.data?.entitlements) ? e.data.entitlements : [],
    })),
  )

  // Estimate synced count
  const totalEvents = allRedemptions.value.length
  syncedCount.value = Math.max(0, totalEvents - unsynced)
})

async function syncNow() {
  isSyncing.value = true
  syncError.value = ''
  try {
    await store.syncWithSyncServer()
    const unsynced = await store.getUnsyncedEventsCount()
    unsyncedCount.value = unsynced
    redemptionStore.lastSyncTime = new Date().toISOString()
  } catch (err) {
    syncError.value = err instanceof Error ? err.message : 'Sync failed'
  } finally {
    isSyncing.value = false
  }
}

async function closeSession() {
  if (unsyncedCount.value > 0) {
    showCloseWarning.value = true
    return
  }
  redemptionStore.unbindDistributionPoint()
  router.push({ name: 'redemption-dashboard', params: { id: appId } })
}

function forceCloseSession() {
  redemptionStore.unbindDistributionPoint()
  router.push({ name: 'redemption-dashboard', params: { id: appId } })
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="summary-view">
    <div class="summary-view__content">
      <div class="top-bar">
        <button class="icon-button" type="button" @click="goBack" aria-label="Back">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
          </svg>
        </button>
        <h1 class="top-bar__title">End of Day Summary</h1>
      </div>

      <div class="date-header">
        <p class="date-header__date">{{ sessionDate }}</p>
        <p v-if="redemptionStore.distributionPointName" class="date-header__point">
          {{ redemptionStore.distributionPointName }}
        </p>
      </div>

      <!-- Overview card -->
      <div class="overview-card">
        <h2 class="section-title">Overview</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-item__value">{{ redemptionStore.totalAllocated }}</span>
            <span class="stat-item__label">Expected</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__value">{{ redemptionStore.servedCount }}</span>
            <span class="stat-item__label">Served</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__value">{{ totalRedemptions }}</span>
            <span class="stat-item__label">Redemptions</span>
          </div>
          <div class="stat-item stat-item--warning">
            <span class="stat-item__value">{{ totalVoided }}</span>
            <span class="stat-item__label">Voided</span>
          </div>
        </div>
      </div>

      <!-- By-program breakdown -->
      <div v-if="programStats.length > 0" class="program-card">
        <h2 class="section-title">By Program</h2>
        <div class="program-list">
          <div v-for="stat in programStats" :key="stat.programName" class="program-item">
            <span class="program-item__name">{{ stat.programName }}</span>
            <div class="program-item__stats">
              <span v-if="stat.allocated > 0" class="program-item__allocated">
                {{ stat.allocated }} allocated
              </span>
              <span class="program-item__redeemed">{{ stat.redeemed }} redeemed</span>
              <span v-if="stat.voided > 0" class="program-item__voided">
                {{ stat.voided }} voided
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Discrepancies -->
      <div v-if="hasHighVoidRate || unservedCount > 0" class="discrepancy-card">
        <h2 class="section-title section-title--warning">Discrepancies</h2>
        <div class="discrepancy-list">
          <div v-if="hasHighVoidRate" class="discrepancy-item discrepancy-item--error">
            <svg viewBox="0 0 24 24" class="discrepancy-item__icon" aria-hidden="true">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor" />
            </svg>
            <span>High void rate: {{ voidRate.toFixed(1) }}% (threshold: 5%)</span>
          </div>
          <div v-if="unservedCount > 0" class="discrepancy-item discrepancy-item--warn">
            <svg viewBox="0 0 24 24" class="discrepancy-item__icon" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor" />
            </svg>
            <span>{{ unservedCount }} beneficiar{{ unservedCount === 1 ? 'y' : 'ies' }} not served</span>
          </div>
        </div>
      </div>

      <!-- Sync status card -->
      <div class="sync-card">
        <h2 class="section-title">Sync Status</h2>
        <div class="sync-stats">
          <div class="sync-stat">
            <span class="sync-stat__value sync-stat__value--synced">{{ syncedCount }}</span>
            <span class="sync-stat__label">Synced</span>
          </div>
          <div class="sync-stat">
            <span
              class="sync-stat__value"
              :class="unsyncedCount > 0 ? 'sync-stat__value--pending' : 'sync-stat__value--synced'"
            >
              {{ unsyncedCount }}
            </span>
            <span class="sync-stat__label">Pending</span>
          </div>
        </div>
        <p class="sync-card__last-sync">Last sync: {{ lastSyncDisplay }}</p>
        <p v-if="syncError" class="sync-card__error" role="alert">{{ syncError }}</p>
        <button
          class="sync-btn"
          type="button"
          :disabled="isSyncing"
          @click="syncNow"
        >
          {{ isSyncing ? 'Syncing…' : 'Sync Now' }}
        </button>
      </div>

      <!-- Close session -->
      <div v-if="showCloseWarning" class="close-warning" role="alert">
        <p class="close-warning__text">
          You have {{ unsyncedCount }} pending event{{ unsyncedCount === 1 ? '' : 's' }} that
          {{ unsyncedCount === 1 ? "hasn't" : "haven't" }} synced to the server.
          {{ unsyncedCount === 1 ? 'It is' : 'They are' }} stored locally and will sync when you reconnect. Close anyway?
        </p>
        <div class="close-warning__actions">
          <button class="close-warning__cancel" type="button" @click="showCloseWarning = false">
            Cancel
          </button>
          <button class="close-warning__confirm" type="button" @click="forceCloseSession">
            Close Anyway
          </button>
        </div>
      </div>

      <button class="close-btn" type="button" @click="closeSession">
        Close Distribution Session
      </button>
    </div>
  </div>
</template>

<style scoped>
.summary-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.summary-view__content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1rem;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.icon-button {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  display: grid;
  place-items: center;
  color: #1f2937;
  flex-shrink: 0;
  cursor: pointer;
}

.icon-button svg {
  width: 22px;
  height: 22px;
}

.top-bar__title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.date-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.date-header__date {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.date-header__point {
  font-size: 0.9rem;
  color: #6b7280;
  margin: 0;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0 0 0.75rem;
}

.section-title--warning {
  color: #d97706;
}

.overview-card,
.program-card,
.discrepancy-card,
.sync-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.stat-item__value {
  font-size: 1.5rem;
  font-weight: 800;
  color: #111827;
}

.stat-item__label {
  font-size: 0.75rem;
  color: #6b7280;
  text-align: center;
}

.stat-item--warning .stat-item__value {
  color: #d97706;
}

.program-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.program-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.program-item__name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
}

.program-item__stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
}

.program-item__allocated {
  font-size: 0.85rem;
  color: #2563eb;
  font-weight: 600;
}

.program-item__redeemed {
  font-size: 0.85rem;
  color: #15803d;
  font-weight: 600;
}

.program-item__voided {
  font-size: 0.8rem;
  color: #b91c1c;
}

.discrepancy-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.discrepancy-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.5rem;
  border-radius: 8px;
}

.discrepancy-item--error {
  background: #fee2e2;
  color: #b91c1c;
}

.discrepancy-item--warn {
  background: #fef3c7;
  color: #92400e;
}

.discrepancy-item__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sync-stats {
  display: flex;
  gap: 2rem;
  margin-bottom: 0.75rem;
}

.sync-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.sync-stat__value {
  font-size: 1.5rem;
  font-weight: 800;
}

.sync-stat__value--synced {
  color: #15803d;
}

.sync-stat__value--pending {
  color: #d97706;
}

.sync-stat__label {
  font-size: 0.75rem;
  color: #6b7280;
}

.sync-card__last-sync {
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0 0 0.75rem;
}

.sync-card__error {
  font-size: 0.85rem;
  color: #b91c1c;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.sync-btn {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  border: 2px solid #2563eb;
  background: transparent;
  color: #2563eb;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s;
}

.sync-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-btn:not(:disabled):active {
  background: #eff6ff;
}

.close-warning {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.close-warning__text {
  font-size: 0.9rem;
  color: #92400e;
  font-weight: 600;
  margin: 0;
}

.close-warning__actions {
  display: flex;
  gap: 0.75rem;
}

.close-warning__cancel {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  border: 2px solid #e5e7eb;
  background: transparent;
  color: #374151;
  font-weight: 600;
  cursor: pointer;
}

.close-warning__confirm {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  border: none;
  background: #ef4444;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

.close-btn {
  width: 100%;
  height: 56px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: white;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.close-btn:active {
  opacity: 0.85;
}
</style>
