<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { store } from '@/store'
import { useRedemptionStore } from '@/store/redemption'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'

interface RedemptionEntry {
  formGuid: string
  receiptNumber: string
  entitlementId: string
  redemptionType: 'quantity' | 'monetary'
  quantity?: number
  amount?: number
  timestamp: string
  status: 'active' | 'voided'
  itemName?: string
  programName?: string
  currency?: string
  unitOfMeasure?: string
  voidReason?: string
  voidedAt?: string
  syncLevel?: number
}

interface GroupedEntries {
  date: string
  entries: RedemptionEntry[]
}

const route = useRoute()
const router = useRouter()
const redemptionStore = useRedemptionStore()

const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string

const entityName = ref('')
const history = ref<RedemptionEntry[]>([])
const expandedEntry = ref<string | null>(null)

const groupedHistory = computed<GroupedEntries[]>(() => {
  const groups = new Map<string, RedemptionEntry[]>()
  for (const entry of history.value) {
    const date = new Date(entry.timestamp).toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(entry)
  }
  return Array.from(groups.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => new Date(b.entries[0].timestamp).getTime() - new Date(a.entries[0].timestamp).getTime())
})

function getEntityDisplayName(data: Record<string, unknown>): string {
  if (typeof data?.name === 'string' && data.name) return data.name
  if (typeof data?.fullName === 'string' && data.fullName) return data.fullName
  const first = typeof data?.firstName === 'string' ? data.firstName : ''
  const last = typeof data?.lastName === 'string' ? data.lastName : ''
  if (first || last) return `${first} ${last}`.trim()
  return 'Beneficiary'
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatAmount(entry: RedemptionEntry): string {
  if (entry.redemptionType === 'monetary') {
    const symbol = entry.currency ?? '$'
    return `${symbol}${(entry.amount ?? 0).toFixed(2)}`
  }
  const unit = entry.unitOfMeasure ? ` ${entry.unitOfMeasure}` : ''
  return `${entry.quantity ?? 0}${unit}`
}

onMounted(async () => {
  const entities = await store.getAllEntities()
  const entity = entities.find((e: { guid: string }) => e.guid === entityGuid)
  if (!entity) return

  const data = (entity as { data: Record<string, unknown> }).data || {}
  entityName.value = getEntityDisplayName(data)
  history.value = Array.isArray(data.redemptionHistory)
    ? (data.redemptionHistory as RedemptionEntry[])
    : []
})

function toggleEntry(formGuid: string) {
  expandedEntry.value = expandedEntry.value === formGuid ? null : formGuid
}

function navigateToVoid(entry: RedemptionEntry) {
  router.push({
    name: 'redemption-void',
    params: { id: appId, entityGuid, redemptionGuid: entry.formGuid },
  })
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="history-view">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <div class="history-view__content">
      <div class="top-bar">
        <button class="icon-button" type="button" @click="goBack" aria-label="Back">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
          </svg>
        </button>
        <h1 class="top-bar__title">{{ entityName }} — History</h1>
      </div>

      <div v-if="history.length === 0" class="history-view__empty">
        <p class="history-view__empty-text">No redemption history found.</p>
      </div>

      <div v-else class="history-view__groups">
        <div v-for="group in groupedHistory" :key="group.date" class="history-group">
          <h2 class="history-group__date">{{ group.date }}</h2>
          <div class="history-group__entries">
            <div
              v-for="entry in group.entries"
              :key="entry.formGuid"
              class="history-entry"
              :class="{ 'history-entry--voided': entry.status === 'voided' }"
              @click="toggleEntry(entry.formGuid)"
            >
              <div class="history-entry__row">
                <div class="history-entry__left">
                  <span
                    class="history-entry__amount"
                    :class="{ 'history-entry__amount--voided': entry.status === 'voided' }"
                  >
                    {{ formatAmount(entry) }}
                  </span>
                  <span v-if="entry.itemName" class="history-entry__item">
                    {{ entry.itemName }}
                  </span>
                </div>
                <div class="history-entry__right">
                  <span class="history-entry__time">{{ formatTime(entry.timestamp) }}</span>
                  <span
                    v-if="entry.status === 'voided'"
                    class="history-entry__badge history-entry__badge--voided"
                  >
                    VOIDED
                  </span>
                  <span
                    v-else-if="entry.syncLevel === 0"
                    class="history-entry__badge history-entry__badge--pending"
                  >
                    PENDING
                  </span>
                </div>
              </div>

              <div class="history-entry__receipt">
                Receipt: {{ entry.receiptNumber }}
              </div>

              <!-- Expanded detail -->
              <div v-if="expandedEntry === entry.formGuid" class="history-entry__detail">
                <div v-if="entry.status === 'voided' && entry.voidReason" class="history-entry__void-reason">
                  Void reason: {{ entry.voidReason }}
                </div>
                <button
                  v-if="entry.status !== 'voided'"
                  class="void-btn"
                  type="button"
                  @click.stop="navigateToVoid(entry)"
                >
                  Void This Redemption
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.history-view__content {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-view__empty {
  text-align: center;
  padding: 3rem 1rem;
}

.history-view__empty-text {
  color: #6b7280;
  font-size: 1rem;
}

.history-view__groups {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.history-group__date {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0 0 0.5rem;
}

.history-group__entries {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-entry {
  background: #ffffff;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  cursor: pointer;
  transition: transform 0.15s;
}

.history-entry:active {
  transform: scale(0.99);
}

.history-entry--voided {
  background: #fafafa;
  border: 1px solid #f3f4f6;
}

.history-entry__row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.history-entry__left {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.history-entry__amount {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
}

.history-entry__amount--voided {
  text-decoration: line-through;
  color: #9ca3af;
}

.history-entry__item {
  font-size: 0.85rem;
  color: #6b7280;
}

.history-entry__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.history-entry__time {
  font-size: 0.85rem;
  color: #6b7280;
}

.history-entry__badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.history-entry__badge--voided {
  background: #fee2e2;
  color: #b91c1c;
}

.history-entry__badge--pending {
  background: #fef3c7;
  color: #92400e;
}

.history-entry__receipt {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: #9ca3af;
  font-family: monospace;
}

.history-entry__detail {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f3f4f6;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-entry__void-reason {
  font-size: 0.85rem;
  color: #b91c1c;
}

.void-btn {
  height: 44px;
  border-radius: 999px;
  border: 2px solid #ef4444;
  background: transparent;
  color: #ef4444;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s;
}

.void-btn:active {
  background: #fee2e2;
}
</style>
