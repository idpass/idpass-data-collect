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
  itemName?: string
  programName?: string
  currency?: string
  unitOfMeasure?: string
  syncLevel?: number
}

const route = useRoute()
const router = useRouter()
const redemptionStore = useRedemptionStore()

const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string
const receiptNumber = route.params.receiptNumber as string

const entityName = ref('')
const redemption = ref<RedemptionEntry | null>(null)
const showBeneficiaryOverlay = ref(false)
const unsyncedCount = ref(0)

const isSynced = computed(() => unsyncedCount.value === 0)

const formattedTime = computed(() => {
  if (!redemption.value?.timestamp) return '—'
  return new Date(redemption.value.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const quantityDisplay = computed(() => {
  if (!redemption.value) return '—'
  if (redemption.value.redemptionType === 'monetary') {
    const symbol = redemption.value.currency ?? '$'
    return `${symbol}${(redemption.value.amount ?? 0).toFixed(2)}`
  }
  const unit = redemption.value.unitOfMeasure ? ` ${redemption.value.unitOfMeasure}` : ''
  return `${redemption.value.quantity ?? 0}${unit}`
})

function getEntityDisplayName(data: Record<string, unknown>): string {
  if (typeof data?.name === 'string' && data.name) return data.name
  if (typeof data?.fullName === 'string' && data.fullName) return data.fullName
  const first = typeof data?.firstName === 'string' ? data.firstName : ''
  const last = typeof data?.lastName === 'string' ? data.lastName : ''
  if (first || last) return `${first} ${last}`.trim()
  return 'Beneficiary'
}

onMounted(async () => {
  const [entities, unsynced] = await Promise.all([
    store.getAllEntities(),
    store.getUnsyncedEventsCount(),
  ])
  unsyncedCount.value = unsynced

  const entity = entities.find((e: { guid: string }) => e.guid === entityGuid)
  if (!entity) return

  const data = (entity as { data: Record<string, unknown> }).data || {}
  entityName.value = getEntityDisplayName(data)

  const history: RedemptionEntry[] = Array.isArray(data.redemptionHistory)
    ? (data.redemptionHistory as RedemptionEntry[])
    : []
  redemption.value = history.find((r) => r.receiptNumber === receiptNumber) || null

  // If not yet in entity history (just submitted), reconstruct from session
  if (!redemption.value) {
    const sessionEntry = redemptionStore.sessionRedemptions.find(
      (r) => r.receiptNumber === receiptNumber,
    )
    if (sessionEntry) {
      redemption.value = {
        guid: receiptNumber,
        receiptNumber,
        entitlementId: sessionEntry.entitlementId,
        redemptionType: 'quantity',
        timestamp: sessionEntry.timestamp,
        status: 'active',
        syncLevel: 0,
      }
    }
  }
})

function navigateToDashboard() {
  router.push({ name: 'redemption-dashboard', params: { id: appId } })
}
</script>

<template>
  <div class="receipt-view">
    <div class="receipt-view__worker">
      <div class="top-bar">
        <button
          class="icon-button"
          type="button"
          @click="navigateToDashboard"
          aria-label="Back to dashboard"
        >
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
          </svg>
        </button>
        <h1 class="top-bar__title">Receipt</h1>
      </div>

      <div class="success-header">
        <div class="success-header__icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="24" fill="#22c55e" />
            <polyline
              points="12,24 21,33 36,16"
              stroke="white"
              stroke-width="3.5"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="success-header__title">Redemption Successful</h2>
      </div>

      <div class="receipt-card">
        <div class="receipt-card__row">
          <span class="receipt-card__label">Receipt No.</span>
          <span class="receipt-card__value receipt-card__value--mono">{{ receiptNumber }}</span>
        </div>
        <div class="receipt-card__divider"></div>
        <div class="receipt-card__row">
          <span class="receipt-card__label">Beneficiary</span>
          <span class="receipt-card__value">{{ entityName }}</span>
        </div>
        <div v-if="redemption?.programName" class="receipt-card__row">
          <span class="receipt-card__label">Program</span>
          <span class="receipt-card__value">{{ redemption.programName }}</span>
        </div>
        <div v-if="redemption?.itemName" class="receipt-card__row">
          <span class="receipt-card__label">Item</span>
          <span class="receipt-card__value">{{ redemption.itemName }}</span>
        </div>
        <div class="receipt-card__row">
          <span class="receipt-card__label">Amount / Qty</span>
          <span class="receipt-card__value receipt-card__value--large">{{ quantityDisplay }}</span>
        </div>
        <div class="receipt-card__row">
          <span class="receipt-card__label">Time</span>
          <span class="receipt-card__value">{{ formattedTime }}</span>
        </div>
        <div class="receipt-card__divider"></div>
        <div class="receipt-card__row">
          <span class="receipt-card__label">Sync Status</span>
          <span
            class="sync-badge"
            :class="isSynced ? 'sync-badge--confirmed' : 'sync-badge--pending'"
          >
            {{ isSynced ? 'CONFIRMED' : 'PENDING SYNC' }}
          </span>
        </div>
      </div>

      <div class="receipt-view__actions">
        <button
          class="action-btn action-btn--secondary"
          type="button"
          @click="showBeneficiaryOverlay = true"
        >
          Show to Beneficiary
        </button>
        <button class="action-btn action-btn--primary" type="button" @click="navigateToDashboard">
          Next Beneficiary
        </button>
      </div>
    </div>

    <!-- Beneficiary-facing overlay -->
    <Teleport to="body">
      <div
        v-if="showBeneficiaryOverlay"
        class="beneficiary-overlay"
        role="dialog"
        aria-modal="true"
      >
        <div class="beneficiary-overlay__inner">
          <div class="beneficiary-overlay__checkmark" aria-hidden="true">
            <svg viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="48" fill="#22c55e" />
              <polyline
                points="22,48 41,67 74,34"
                stroke="white"
                stroke-width="6"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>

          <p class="beneficiary-overlay__received">RECEIVED</p>

          <p class="beneficiary-overlay__quantity">{{ quantityDisplay }}</p>

          <p class="beneficiary-overlay__receipt">Receipt: {{ receiptNumber }}</p>

          <button
            class="beneficiary-overlay__done"
            type="button"
            @click="showBeneficiaryOverlay = false"
          >
            Done
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.receipt-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.receipt-view__worker {
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

.success-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
}

.success-header__icon {
  width: 64px;
  height: 64px;
}

.success-header__icon svg {
  width: 100%;
  height: 100%;
}

.success-header__title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #15803d;
  margin: 0;
}

.receipt-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.receipt-card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.receipt-card__label {
  font-size: 0.85rem;
  color: #6b7280;
}

.receipt-card__value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
  text-align: right;
}

.receipt-card__value--mono {
  font-family: monospace;
  font-size: 0.9rem;
  color: #374151;
}

.receipt-card__value--large {
  font-size: 1.2rem;
  font-weight: 700;
}

.receipt-card__divider {
  height: 1px;
  background: #f3f4f6;
  margin: 0.25rem 0;
}

.sync-badge {
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.sync-badge--confirmed {
  background: #dcfce7;
  color: #15803d;
}

.sync-badge--pending {
  background: #fef3c7;
  color: #92400e;
}

.receipt-view__actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.action-btn {
  width: 100%;
  height: 52px;
  border-radius: 999px;
  border: none;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.action-btn--primary {
  background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
  color: white;
}

.action-btn--secondary {
  background: rgba(15, 23, 42, 0.08);
  color: #1f2937;
}

/* Beneficiary overlay */
.beneficiary-overlay {
  position: fixed;
  inset: 0;
  background: #ffffff;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
}

.beneficiary-overlay__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
}

.beneficiary-overlay__checkmark {
  width: 120px;
  height: 120px;
}

.beneficiary-overlay__checkmark svg {
  width: 100%;
  height: 100%;
}

.beneficiary-overlay__received {
  font-size: 2.5rem;
  font-weight: 800;
  color: #15803d;
  letter-spacing: 0.05em;
  margin: 0;
}

.beneficiary-overlay__quantity {
  font-size: 3rem;
  font-weight: 800;
  color: #111827;
  margin: 0;
}

.beneficiary-overlay__receipt {
  font-size: 1rem;
  color: #6b7280;
  font-family: monospace;
  margin: 0;
}

.beneficiary-overlay__done {
  width: 100%;
  height: 64px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  margin-top: 1rem;
}
</style>
