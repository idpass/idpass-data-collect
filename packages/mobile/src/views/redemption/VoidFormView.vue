<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { store } from '@/store'
import { useTenantStore } from '@/store/tenant'
import { useAuthManagerStore } from '@/store/authManager'
import SupervisorPinDialog from '@/components/shared/SupervisorPinDialog.vue'

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
}

interface SupervisorPin {
  supervisorId: string
  name: string
  pinHash: string
  salt: string
}

const VOID_REASONS = [
  'Duplicate redemption',
  'Wrong beneficiary',
  'Wrong quantity',
  'System error',
]

const route = useRoute()
const router = useRouter()
const tenantStore = useTenantStore()
const authManagerStore = useAuthManagerStore()

const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string
const redemptionGuid = route.params.redemptionGuid as string

const entityName = ref('')
const redemption = ref<RedemptionEntry | null>(null)
const selectedReason = ref('')
const additionalNotes = ref('')
const showPinDialog = ref(false)
const supervisorPins = ref<SupervisorPin[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

function getEntityDisplayName(data: Record<string, unknown>): string {
  if (typeof data?.name === 'string' && data.name) return data.name
  if (typeof data?.fullName === 'string' && data.fullName) return data.fullName
  const first = typeof data?.firstName === 'string' ? data.firstName : ''
  const last = typeof data?.lastName === 'string' ? data.lastName : ''
  if (first || last) return `${first} ${last}`.trim()
  return 'Beneficiary'
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
  const [entities, tenant] = await Promise.all([
    store.getAllEntities(),
    tenantStore.getTenant(appId),
  ])

  // Load supervisor PINs from tenant config
  const tenantData = (tenant as { _data?: Record<string, unknown> })?._data ?? {}
  supervisorPins.value = Array.isArray(tenantData.supervisorPins)
    ? (tenantData.supervisorPins as SupervisorPin[])
    : []

  const entity = entities.find((e: { guid: string }) => e.guid === entityGuid)
  if (!entity) return

  const data = (entity as { data: Record<string, unknown> }).data || {}
  entityName.value = getEntityDisplayName(data)

  const history: RedemptionEntry[] = Array.isArray(data.redemptionHistory)
    ? (data.redemptionHistory as RedemptionEntry[])
    : []
  redemption.value = history.find((r) => r.formGuid === redemptionGuid) || null
})

function openPinDialog() {
  if (!selectedReason.value) {
    errorMessage.value = 'Please select a void reason.'
    return
  }
  errorMessage.value = ''
  showPinDialog.value = true
}

async function onPinVerified(supervisorId: string) {
  showPinDialog.value = false
  if (!redemption.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const formData: Record<string, unknown> = {
      originalRedemptionGuid: redemption.value.formGuid,
      entitlementId: redemption.value.entitlementId,
      redemptionType: redemption.value.redemptionType,
      reason: selectedReason.value,
      supervisorVerified: true,
      supervisorId,
    }

    if (redemption.value.redemptionType === 'quantity') {
      formData.quantity = redemption.value.quantity
    } else {
      formData.amount = redemption.value.amount
    }

    if (additionalNotes.value.trim()) {
      formData.notes = additionalNotes.value.trim()
    }

    // Use the current authenticated user as the audit userId, falling back to
    // 'anonymous' when no session is available.
    const userId = authManagerStore.currentProvider ?? 'anonymous'
    if (!authManagerStore.currentProvider) {
      console.warn('No authenticated user found; using anonymous as userId for void-redemption submission')
    }

    await store.submitForm({
      guid: uuidv4(),
      entityGuid,
      type: 'void-redemption',
      data: formData,
      timestamp: new Date().toISOString(),
      userId,
      syncLevel: 0,
    })

    successMessage.value = 'Redemption voided successfully.'

    // Navigate back to history after a brief moment
    setTimeout(() => {
      router.push({
        name: 'redemption-history',
        params: { id: appId, entityGuid },
      })
    }, 1200)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to void redemption'
  } finally {
    isLoading.value = false
  }
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="void-form-view">
    <div class="void-form-view__content">
      <div class="top-bar">
        <button class="icon-button" type="button" @click="goBack" aria-label="Back">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
          </svg>
        </button>
        <h1 class="top-bar__title">Void Redemption</h1>
      </div>

      <div class="warning-banner" role="alert">
        <svg viewBox="0 0 24 24" class="warning-banner__icon" aria-hidden="true">
          <path
            d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
            fill="currentColor"
          />
        </svg>
        <span>This action cannot be undone</span>
      </div>

      <div v-if="redemption" class="receipt-details">
        <div class="receipt-details__row">
          <span class="receipt-details__label">Beneficiary</span>
          <span class="receipt-details__value">{{ entityName }}</span>
        </div>
        <div class="receipt-details__row">
          <span class="receipt-details__label">Receipt No.</span>
          <span class="receipt-details__value receipt-details__value--mono">
            {{ redemption.receiptNumber }}
          </span>
        </div>
        <div v-if="redemption.itemName" class="receipt-details__row">
          <span class="receipt-details__label">Item</span>
          <span class="receipt-details__value">{{ redemption.itemName }}</span>
        </div>
        <div class="receipt-details__row">
          <span class="receipt-details__label">Amount / Qty</span>
          <span class="receipt-details__value receipt-details__value--large">
            {{ formatAmount(redemption) }}
          </span>
        </div>
      </div>

      <div class="form-section">
        <label class="form-section__label" for="void-reason">Reason for void</label>
        <select id="void-reason" v-model="selectedReason" class="form-section__select">
          <option value="" disabled>Select a reason…</option>
          <option v-for="reason in VOID_REASONS" :key="reason" :value="reason">
            {{ reason }}
          </option>
        </select>
      </div>

      <div class="form-section">
        <label class="form-section__label" for="void-notes">Additional notes (optional)</label>
        <textarea
          id="void-notes"
          v-model="additionalNotes"
          class="form-section__textarea"
          rows="3"
          placeholder="Any additional context…"
        ></textarea>
      </div>

      <p v-if="errorMessage" class="message message--error" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="message message--success" role="status">
        {{ successMessage }}
      </p>

      <button
        class="void-btn"
        type="button"
        :disabled="!selectedReason || isLoading"
        @click="openPinDialog"
      >
        <svg viewBox="0 0 24 24" class="void-btn__icon" aria-hidden="true">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="currentColor" />
        </svg>
        Void — Requires Supervisor PIN
      </button>
    </div>

    <SupervisorPinDialog
      :visible="showPinDialog"
      title="Supervisor Authorization — Void"
      :supervisor-pins="supervisorPins"
      @verified="onPinVerified"
      @cancel="showPinDialog = false"
    />
  </div>
</template>

<style scoped>
.void-form-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.void-form-view__content {
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

.warning-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  color: #92400e;
  font-weight: 600;
  font-size: 0.95rem;
}

.warning-banner__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: #d97706;
}

.receipt-details {
  background: #ffffff;
  border-radius: 18px;
  padding: 1rem 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.receipt-details__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.receipt-details__label {
  font-size: 0.85rem;
  color: #6b7280;
}

.receipt-details__value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
  text-align: right;
}

.receipt-details__value--mono {
  font-family: monospace;
  font-size: 0.9rem;
  color: #374151;
}

.receipt-details__value--large {
  font-size: 1.1rem;
  font-weight: 700;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-section__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.form-section__select {
  height: 48px;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  padding: 0 1rem;
  font-size: 0.95rem;
  color: #111827;
  background: #ffffff;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%236b7280'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
}

.form-section__select:focus {
  border-color: #2563eb;
}

.form-section__textarea {
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  color: #111827;
  resize: none;
  outline: none;
  font-family: inherit;
}

.form-section__textarea:focus {
  border-color: #2563eb;
}

.message {
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
  padding: 0.5rem;
  border-radius: 8px;
}

.message--error {
  color: #b91c1c;
  background: #fee2e2;
}

.message--success {
  color: #15803d;
  background: #dcfce7;
}

.void-btn {
  width: 100%;
  height: 56px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: white;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: opacity 0.2s;
}

.void-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.void-btn__icon {
  width: 18px;
  height: 18px;
}
</style>
