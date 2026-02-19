<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
import BalanceIndicator from '@/components/shared/BalanceIndicator.vue'
import { store } from '@/store/index'
import { useRedemptionStore } from '@/store/redemption'
import { useErrorHandler } from '@/composables/useErrorHandler'

interface Entitlement {
  id: string
  programName?: string
  itemName?: string
  type?: 'in-kind' | 'cash'
  allocated?: number
  redeemed?: number
  currency?: string
  unitOfMeasure?: string
  validFrom?: string
  validUntil?: string
  distributionPointId?: string
}

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string

const redemptionStore = useRedemptionStore()
const { handleError } = useErrorHandler(appId)

const entity = ref<any | null>(null)
const isLoading = ref(true)

const now = new Date()

onMounted(async () => {
  try {
    const entities = await store.getAllEntities()
    entity.value = entities.find((e: any) => e.guid === entityGuid) ?? null
  } catch (err) {
    await handleError(err)
  } finally {
    isLoading.value = false
  }
})

const entityName = computed(() => entity.value?.data?.name ?? 'Beneficiary')

const allEntitlements = computed<Entitlement[]>(() => entity.value?.data?.entitlements ?? [])

const activeEntitlements = computed(() =>
  allEntitlements.value.filter((e) => {
    if (!e.validUntil) return true
    return new Date(e.validUntil) >= now
  }),
)

const expiredEntitlements = computed(() =>
  allEntitlements.value.filter((e) => {
    if (!e.validUntil) return false
    return new Date(e.validUntil) < now
  }),
)

const groupedEntitlements = computed(() => {
  const groups: Record<string, Entitlement[]> = {}
  for (const e of activeEntitlements.value) {
    const program = e.programName ?? 'General'
    if (!groups[program]) groups[program] = []
    groups[program].push(e)
  }
  return groups
})

const isDuplicate = (entitlementId: string): boolean => {
  return redemptionStore.checkDuplicateRedemption(entityGuid, entitlementId).isDuplicate
}

const hasAnyDuplicate = computed(() =>
  activeEntitlements.value.some((e) => isDuplicate(e.id)),
)

const handleRedeem = (entitlementId: string) => {
  router.push(`/app/${appId}/redemption/beneficiary/${entityGuid}/redeem/${entitlementId}`)
}

const handleViewHistory = () => {
  router.push(`/app/${appId}/redemption/beneficiary/${entityGuid}/history`)
}

const goBack = () => {
  router.back()
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}
</script>

<template>
  <div class="entitlement-list">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <header class="entitlement-list__topbar">
      <button class="entitlement-list__back-btn" aria-label="Go back" @click="goBack">
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
      <h1 class="entitlement-list__title">{{ entityName }}</h1>
      <div style="width: 40px"></div>
    </header>

    <div class="entitlement-list__content">
      <div v-if="isLoading" class="entitlement-list__loading">Loading…</div>
      <template v-else>
        <!-- Duplicate Warning -->
        <div
          v-if="hasAnyDuplicate"
          class="entitlement-list__duplicate-warning"
          data-testid="duplicate-warning"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M9 1L17 17H1L9 1z" stroke="#D97706" stroke-width="1.5" />
            <line
              x1="9"
              y1="7"
              x2="9"
              y2="11"
              stroke="#D97706"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <circle cx="9" cy="13.5" r="0.75" fill="#D97706" />
          </svg>
          This beneficiary has already received an entitlement this session.
        </div>

        <!-- Active Entitlements by Program -->
        <div
          v-if="Object.keys(groupedEntitlements).length === 0 && expiredEntitlements.length === 0"
          class="entitlement-list__empty"
          data-testid="empty-message"
        >
          No entitlements found
        </div>

        <div
          v-for="(items, programName) in groupedEntitlements"
          :key="programName"
          class="entitlement-list__program-group"
        >
          <h2 class="entitlement-list__program-name">{{ programName }}</h2>
          <div
            v-for="entitlement in items"
            :key="entitlement.id"
            class="entitlement-list__card"
            :data-testid="`entitlement-card-${entitlement.id}`"
          >
            <div class="entitlement-list__card-header">
              <div>
                <div class="entitlement-list__item-name">
                  {{ entitlement.itemName ?? 'Entitlement' }}
                </div>
                <span
                  class="entitlement-list__type-pill"
                  :class="
                    entitlement.type === 'cash'
                      ? 'entitlement-list__type-pill--cash'
                      : 'entitlement-list__type-pill--in-kind'
                  "
                >
                  {{ entitlement.type === 'cash' ? 'Cash' : 'In-Kind' }}
                </span>
              </div>
              <div class="entitlement-list__validity">
                <div v-if="entitlement.validFrom" class="entitlement-list__date">
                  From: {{ formatDate(entitlement.validFrom) }}
                </div>
                <div v-if="entitlement.validUntil" class="entitlement-list__date">
                  Until: {{ formatDate(entitlement.validUntil) }}
                </div>
              </div>
            </div>
            <BalanceIndicator
              :allocated="entitlement.allocated ?? 1"
              :redeemed="entitlement.redeemed ?? 0"
              :type="entitlement.type === 'cash' ? 'monetary' : 'quantity'"
              :currency="entitlement.currency"
              :unit-of-measure="entitlement.unitOfMeasure"
            />
            <button
              class="entitlement-list__redeem-btn"
              :class="{ 'entitlement-list__redeem-btn--duplicate': isDuplicate(entitlement.id) }"
              :data-testid="`redeem-btn-${entitlement.id}`"
              @click="handleRedeem(entitlement.id)"
            >
              {{ isDuplicate(entitlement.id) ? 'Redeem Again?' : 'Redeem' }}
            </button>
          </div>
        </div>

        <!-- Expired Entitlements -->
        <div v-if="expiredEntitlements.length > 0" class="entitlement-list__expired-section">
          <h2 class="entitlement-list__section-title entitlement-list__section-title--expired">
            Expired Entitlements
          </h2>
          <div
            v-for="entitlement in expiredEntitlements"
            :key="entitlement.id"
            class="entitlement-list__card entitlement-list__card--expired"
            :data-testid="`expired-card-${entitlement.id}`"
          >
            <div class="entitlement-list__item-name">
              {{ entitlement.itemName ?? 'Entitlement' }}
            </div>
            <div class="entitlement-list__date">
              Expired: {{ formatDate(entitlement.validUntil) }}
            </div>
          </div>
        </div>

        <!-- View History -->
        <button
          class="entitlement-list__history-link"
          data-testid="history-link"
          @click="handleViewHistory"
        >
          View History
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entitlement-list {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.entitlement-list__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.entitlement-list__back-btn {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: white;
  display: grid;
  place-items: center;
  color: #64748b;
  cursor: pointer;
}

.entitlement-list__title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.entitlement-list__content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.entitlement-list__loading,
.entitlement-list__empty {
  text-align: center;
  color: #94a3b8;
  padding: 32px;
  font-size: 14px;
}

.entitlement-list__duplicate-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 14px;
  padding: 12px 16px;
  color: #92400e;
  font-size: 14px;
  font-weight: 500;
}

.entitlement-list__program-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entitlement-list__program-name {
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.entitlement-list__card {
  background: white;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entitlement-list__card--expired {
  opacity: 0.5;
  box-shadow: none;
  background: #f1f5f9;
}

.entitlement-list__card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.entitlement-list__item-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.entitlement-list__type-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 4px;
}

.entitlement-list__type-pill--cash {
  background: #dbeafe;
  color: #1d4ed8;
}

.entitlement-list__type-pill--in-kind {
  background: #dcfce7;
  color: #166534;
}

.entitlement-list__validity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.entitlement-list__date {
  font-size: 11px;
  color: #94a3b8;
}

.entitlement-list__redeem-btn {
  height: 48px;
  border-radius: 14px;
  border: none;
  background: #22c55e;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}

.entitlement-list__redeem-btn--duplicate {
  background: #d97706;
}

.entitlement-list__expired-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entitlement-list__section-title {
  font-size: 14px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.entitlement-list__section-title--expired {
  color: #94a3b8;
}

.entitlement-list__history-link {
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 8px 0;
  min-height: 44px;
}
</style>
