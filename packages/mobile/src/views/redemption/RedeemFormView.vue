<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { store } from '@/store'
import { useRedemptionStore } from '@/store/redemption'
import { useAuthManagerStore } from '@/store/authManager'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
import BalanceIndicator from '@/components/shared/BalanceIndicator.vue'

interface Entitlement {
  id: string
  distributionPointId?: string
  itemName: string
  programName?: string
  redemptionType: 'quantity' | 'monetary'
  allocated: number
  redeemed: number
  currency?: string
  unitOfMeasure?: string
}

const route = useRoute()
const router = useRouter()
const redemptionStore = useRedemptionStore()
const authManagerStore = useAuthManagerStore()

const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string
const entitlementId = route.params.entitlementId as string

const entityName = ref('')
const entitlement = ref<Entitlement | null>(null)
const quantityValue = ref(1)
const amountValue = ref('')
const notes = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const remaining = computed(() => {
  if (!entitlement.value) return 0
  return entitlement.value.allocated - entitlement.value.redeemed
})

const isQuantityType = computed(() => entitlement.value?.redemptionType === 'quantity')

const isConfirmDisabled = computed(() => {
  if (!entitlement.value) return true
  if (isQuantityType.value) {
    return quantityValue.value < 1 || quantityValue.value > remaining.value
  }
  const parsed = parseFloat(amountValue.value)
  return isNaN(parsed) || parsed <= 0 || parsed > remaining.value
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
  const entities = await store.getAllEntities()
  const entity = entities.find((e: { guid: string }) => e.guid === entityGuid)
  if (!entity) return

  const data = (entity as { data: Record<string, unknown> }).data || {}
  entityName.value = getEntityDisplayName(data)

  const entitlements: Entitlement[] = Array.isArray(data.entitlements)
    ? (data.entitlements as Entitlement[])
    : []
  entitlement.value = entitlements.find((e) => e.id === entitlementId) || null

  if (entitlement.value && !isQuantityType.value) {
    amountValue.value = remaining.value.toFixed(2)
  }
})

function stepQuantity(delta: number) {
  const next = quantityValue.value + delta
  if (next >= 1 && next <= remaining.value) {
    quantityValue.value = next
  }
}

function applyQuickAmount(fraction: number) {
  if (isQuantityType.value) {
    quantityValue.value = Math.max(1, Math.round(remaining.value * fraction))
  } else {
    amountValue.value = (remaining.value * fraction).toFixed(2)
  }
}

async function confirmRedemption() {
  if (!entitlement.value || isConfirmDisabled.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const receiptNumber = redemptionStore.generateReceiptNumber()
    const timestamp = new Date().toISOString()

    const formData: Record<string, unknown> = {
      entitlementId,
      redemptionType: entitlement.value.redemptionType,
      receiptNumber,
      distributionPointGuid: redemptionStore.distributionPointId ?? undefined,
    }

    if (isQuantityType.value) {
      formData.quantity = quantityValue.value
    } else {
      formData.amount = parseFloat(amountValue.value)
    }

    if (notes.value.trim()) {
      formData.notes = notes.value.trim()
    }

    // Use the current authenticated user as the audit userId, falling back to
    // 'anonymous' when no session is available.
    const userId = authManagerStore.currentProvider ?? 'anonymous'
    if (!authManagerStore.currentProvider) {
      console.warn('No authenticated user found; using anonymous as userId for redemption submission')
    }

    await store.submitForm({
      guid: uuidv4(),
      entityGuid,
      type: 'redeem-entitlement',
      data: formData,
      timestamp,
      userId,
      syncLevel: 0,
    })

    redemptionStore.addRedemptionToSession(entityGuid, receiptNumber, entitlementId)

    router.push({
      name: 'redemption-receipt',
      params: { id: appId, entityGuid, receiptNumber },
    })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to process redemption'
  } finally {
    isLoading.value = false
  }
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="redeem-form-view">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <div class="redeem-form-view__content">
      <div class="top-bar">
        <button class="icon-button" type="button" @click="goBack" aria-label="Back">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
          </svg>
        </button>
        <h1 class="top-bar__title">Redeem: {{ entitlement?.itemName ?? '…' }}</h1>
      </div>

      <div v-if="entitlement" class="redeem-form-view__body">
        <div class="info-card">
          <div class="info-card__row">
            <span class="info-card__label">Beneficiary</span>
            <span class="info-card__value">{{ entityName }}</span>
          </div>
          <div v-if="entitlement.programName" class="info-card__row">
            <span class="info-card__label">Program</span>
            <span class="info-card__value">{{ entitlement.programName }}</span>
          </div>
        </div>

        <BalanceIndicator
          :allocated="entitlement.allocated"
          :redeemed="entitlement.redeemed"
          :type="entitlement.redemptionType"
          :currency="entitlement.currency"
          :unit-of-measure="entitlement.unitOfMeasure"
        />

        <div class="input-section">
          <label class="input-section__label">
            {{ isQuantityType ? 'Quantity' : `Amount (${entitlement.currency ?? '$'})` }}
          </label>

          <div v-if="isQuantityType" class="stepper">
            <button
              class="stepper__btn"
              type="button"
              :disabled="quantityValue <= 1"
              @click="stepQuantity(-1)"
              aria-label="Decrease"
            >
              −
            </button>
            <span class="stepper__value" data-testid="quantity-value">{{ quantityValue }}</span>
            <button
              class="stepper__btn"
              type="button"
              :disabled="quantityValue >= remaining"
              @click="stepQuantity(1)"
              aria-label="Increase"
            >
              +
            </button>
          </div>

          <div v-else class="monetary-input">
            <span class="monetary-input__prefix">{{ entitlement.currency ?? '$' }}</span>
            <input
              v-model="amountValue"
              type="number"
              min="0.01"
              :max="remaining"
              step="0.01"
              class="monetary-input__field"
              aria-label="Amount"
            />
          </div>

          <div class="quick-amounts">
            <button class="quick-btn" type="button" @click="applyQuickAmount(0.25)">25%</button>
            <button class="quick-btn" type="button" @click="applyQuickAmount(0.5)">50%</button>
            <button class="quick-btn" type="button" @click="applyQuickAmount(0.75)">75%</button>
            <button class="quick-btn quick-btn--all" type="button" @click="applyQuickAmount(1)">
              All
            </button>
          </div>
        </div>

        <div class="notes-section">
          <label class="notes-section__label" for="redemption-notes">Notes (optional)</label>
          <textarea
            id="redemption-notes"
            v-model="notes"
            class="notes-section__textarea"
            rows="3"
            placeholder="Additional notes…"
          ></textarea>
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

        <button
          class="confirm-btn"
          type="button"
          :disabled="isConfirmDisabled || isLoading"
          @click="confirmRedemption"
        >
          {{ isLoading ? 'Processing…' : 'Confirm Redemption' }}
        </button>
      </div>

      <div v-else class="redeem-form-view__empty">
        <p>Loading entitlement…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.redeem-form-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.redeem-form-view__content {
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

.info-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1rem 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-card__label {
  font-size: 0.85rem;
  color: #6b7280;
}

.info-card__value {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
}

.input-section {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-section__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: center;
}

.stepper__btn {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background-color 0.15s;
}

.stepper__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stepper__btn:not(:disabled):active {
  background: #e5e7eb;
}

.stepper__value {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  min-width: 3rem;
  text-align: center;
}

.monetary-input {
  display: flex;
  align-items: center;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}

.monetary-input__prefix {
  padding: 0.75rem 1rem;
  background: #f3f4f6;
  font-weight: 600;
  color: #374151;
}

.monetary-input__field {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
  outline: none;
}

.quick-amounts {
  display: flex;
  gap: 0.5rem;
}

.quick-btn {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s;
}

.quick-btn:active {
  background: #e5e7eb;
}

.quick-btn--all {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.notes-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notes-section__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.notes-section__textarea {
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  color: #111827;
  resize: none;
  outline: none;
  font-family: inherit;
}

.notes-section__textarea:focus {
  border-color: #2563eb;
}

.error-message {
  color: #b91c1c;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}

.confirm-btn {
  width: 100%;
  height: 56px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.redeem-form-view__empty {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
</style>
