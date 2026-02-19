<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
import { store } from '@/store/index'
import { useRedemptionStore } from '@/store/redemption'
import { useTenantStore } from '@/store/tenant'
import { useErrorHandler } from '@/composables/useErrorHandler'

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string
const entityGuid = route.params.entityGuid as string

const redemptionStore = useRedemptionStore()
const tenantStore = useTenantStore()
const { handleError } = useErrorHandler(appId)

const entity = ref<any | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  try {
    const config = await tenantStore.getTenant(appId)
    const redemptionConfig = (config as any)?.redemptionConfig
    if (redemptionConfig?.identityConfirmation?.enabled === false) {
      router.replace(`/app/${appId}/redemption/beneficiary/${entityGuid}/entitlements`)
      return
    }
    const entities = await store.getAllEntities()
    entity.value = entities.find((e: any) => e.guid === entityGuid) ?? null
  } catch (err) {
    await handleError(err)
  } finally {
    isLoading.value = false
  }
})

const handleConfirm = () => {
  router.push(`/app/${appId}/redemption/beneficiary/${entityGuid}/entitlements`)
}

const handleNotThisPerson = () => {
  router.back()
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
  <div class="identity-confirm">
    <ConnectivityBanner
      :last-sync-time="redemptionStore.lastSyncTime ?? undefined"
      :served-count="redemptionStore.servedCount"
      :total-count="redemptionStore.totalAllocated"
    />

    <header class="identity-confirm__topbar">
      <button class="identity-confirm__back-btn" aria-label="Go back" @click="goBack">
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
      <h1 class="identity-confirm__title">Confirm Identity</h1>
      <div style="width: 40px"></div>
    </header>

    <div class="identity-confirm__content">
      <div v-if="isLoading" class="identity-confirm__loading">Loading…</div>
      <div v-else-if="!entity" class="identity-confirm__not-found">Beneficiary not found</div>
      <template v-else>
        <!-- Photo -->
        <div class="identity-confirm__photo-wrapper">
          <img
            v-if="entity.data?.photo"
            :src="entity.data.photo"
            alt="Beneficiary photo"
            class="identity-confirm__photo"
          />
          <div
            v-else
            class="identity-confirm__photo-placeholder"
            aria-label="No photo available"
          >
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="18" r="10" stroke="#94a3b8" stroke-width="2" />
              <path
                d="M4 44c0-11 9-20 20-20s20 9 20 20"
                stroke="#94a3b8"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </div>
        </div>

        <!-- Fields -->
        <div class="identity-confirm__card">
          <div class="identity-confirm__field">
            <span class="identity-confirm__field-label">Full Name</span>
            <span class="identity-confirm__field-value" data-testid="entity-name">{{
              entity.data?.name ?? '—'
            }}</span>
          </div>
          <div class="identity-confirm__field">
            <span class="identity-confirm__field-label">Date of Birth</span>
            <span class="identity-confirm__field-value" data-testid="entity-dob">{{
              formatDate(entity.data?.dob)
            }}</span>
          </div>
          <div class="identity-confirm__field">
            <span class="identity-confirm__field-label">ID Number</span>
            <span class="identity-confirm__field-value" data-testid="entity-id">{{
              entity.data?.externalId ?? '—'
            }}</span>
          </div>
          <div class="identity-confirm__field">
            <span class="identity-confirm__field-label">Household ID</span>
            <span class="identity-confirm__field-value" data-testid="entity-household">{{
              entity.data?.householdId ?? '—'
            }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="identity-confirm__actions">
          <button
            class="identity-confirm__btn identity-confirm__btn--primary"
            data-testid="confirm-btn"
            @click="handleConfirm"
          >
            Confirm Identity
          </button>
          <button
            class="identity-confirm__btn identity-confirm__btn--secondary"
            data-testid="not-this-person-btn"
            @click="handleNotThisPerson"
          >
            Not This Person
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.identity-confirm {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.identity-confirm__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.identity-confirm__back-btn {
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

.identity-confirm__title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.identity-confirm__content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.identity-confirm__loading,
.identity-confirm__not-found {
  text-align: center;
  color: #94a3b8;
  padding: 32px;
  font-size: 16px;
}

.identity-confirm__photo-wrapper {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #e2e8f0;
}

.identity-confirm__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.identity-confirm__photo-placeholder {
  width: 100%;
  height: 100%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.identity-confirm__card {
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.identity-confirm__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.identity-confirm__field-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  font-weight: 600;
}

.identity-confirm__field-value {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.identity-confirm__actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;
}

.identity-confirm__btn {
  height: 52px;
  border-radius: 14px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}

.identity-confirm__btn--primary {
  background: #22c55e;
  color: white;
}

.identity-confirm__btn--secondary {
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
}
</style>
