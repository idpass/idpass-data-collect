<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { isOnline, onNetworkChange } from '@/utils/networkUtils'
import { useErrorHandler } from '@/composables/useErrorHandler'

const route = useRoute()
const router = useRouter()

const tenantapp = ref<TenantAppData>()
const highLevelEntities = ref<EntityForm[]>([])
const totalEntities = ref(0)
const pendingRecords = ref(0)
const isSynced = ref(false)
const isOffline = ref(false)
const isSyncing = ref(false)
const tenantStore = useTenantStore()
let networkCleanup: (() => void) | null = null

const errorMessage = ref('')
const showError = ref(false)

const { handleError, handleAuthError } = useErrorHandler(route.params.id as string)

const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

const statsSummary = computed(() => {
  const synced = Math.max(totalEntities.value - pendingRecords.value, 0)
  return {
    synced,
    pending: pendingRecords.value,
    total: totalEntities.value
  }
})

const syncWithErrorHandling = async (): Promise<boolean> => {
  try {
    isSyncing.value = true
    await store.syncWithSyncServer()
    return true
  } catch (error) {
    const errorResult = await handleError(error, route.params.id as string)
    if (errorResult.handled) {
      displayError(errorResult.message)
    }
    return false
  } finally {
    isSyncing.value = false
  }
}

const refreshCounts = async () => {
  const [entities, unsynced] = await Promise.all([
    store.getAllEntities(),
    store.getUnsyncedEventsCount()
  ])
  totalEntities.value = entities.length
  pendingRecords.value = unsynced
  isSynced.value = unsynced === 0
}

onMounted(async () => {
  isOffline.value = !(await isOnline())

  networkCleanup = onNetworkChange((online) => {
    isOffline.value = !online
    if (online && !isSynced.value) {
      onSync()
    }
  })

  const tenant = await tenantStore.getTenant(route.params.id as string)
  tenantapp.value = tenant
  highLevelEntities.value = tenantapp.value.entityForms.filter((entity) => !entity.dependsOn)

  await refreshCounts()

  if (!isOffline.value) {
    await syncWithErrorHandling()
    await refreshCounts()
  }
})

onUnmounted(() => {
  if (networkCleanup) {
    networkCleanup()
  }
})

const onBack = () => {
  router.push({ name: 'home' })
}

const onLogout = async () => {
  await handleAuthError(route.params.id as string)
}

const onSync = async () => {
  if (isOffline.value) {
    displayError('Cannot sync while offline. Please check your connection.')
    return
  }

  const syncSuccess = await syncWithErrorHandling()
  if (syncSuccess) {
    await refreshCounts()
    displayError('Sync completed successfully!', 3000)
  }
}

const formattedVersion = computed(() => `v${tenantapp.value?.version ?? '—'}`)
</script>

<template>
  <div class="app-view" v-if="tenantapp">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back to Collection Programs">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <div class="top-bar__actions">
        <button class="pill-button" type="button" @click="onSync" :disabled="isSyncing">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .34-.03.67-.08 1l1.53 1.53C18.81 14.52 19 13.78 19 13c0-3.87-3.13-7-7-7zm-5.92.92L4.55 8.45C3.79 9.69 3.33 11.07 3.14 12.5L1 10.36V15h4.64L3.5 12.86c.17-1.06.56-2.07 1.16-2.94l1.42 1.42z"
              fill="currentColor"
            />
          </svg>
          Sync
        </button>
        <button class="pill-button pill-button--muted" type="button" @click="onLogout">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" fill="currentColor" />
          </svg>
          Logout
        </button>
      </div>
    </div>

    <section class="app-hero">
      <div class="app-hero__header">
        <div>
          <h1>{{ tenantapp.name }}</h1>
          <p>{{ tenantapp.description }}</p>
        </div>
        <span class="version-pill">{{ formattedVersion }}</span>
      </div>
      <div class="status-row">
        <span class="status-pill" :class="{ 'status-pill--offline': isOffline }">
          <span class="status-indicator" :class="{ offline: isOffline }"></span>
          {{ isOffline ? 'Offline mode' : isSynced ? 'Synced' : 'Syncing' }}
        </span>
        <span v-if="showError" class="status-message" :class="errorMessage.includes('successfully') ? 'status-message--success' : 'status-message--error'">
          {{ errorMessage }}
        </span>
      </div>
    </section>

    <section class="app-stats">
      <div class="stat-card">
        <span class="stat-card__label">Synced</span>
        <span class="stat-card__value">{{ statsSummary.synced }}</span>
        <span class="stat-card__hint">records available</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Pending</span>
        <span class="stat-card__value">{{ statsSummary.pending }}</span>
        <span class="stat-card__hint">waiting to sync</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Forms</span>
        <span class="stat-card__value">{{ highLevelEntities.length }}</span>
        <span class="stat-card__hint">ready to collect</span>
      </div>
    </section>

    <section class="forms-list" aria-labelledby="form-list-heading">
      <div class="section-title">
        <h2 id="form-list-heading">Forms ({{ highLevelEntities.length }})</h2>
      </div>
      <ul class="card-list" role="list">
        <li
          v-for="entity in highLevelEntities"
          :key="entity.name"
          class="card-item"
          @click="router.push(`/app/${tenantapp.id}/${entity.name}`)"
        >
          <div class="card-item__header">
            <div>
              <h3>{{ entity.title }}</h3>
              <span class="badge">{{ entity.displayTemplate || 'Form' }}</span>
            </div>
            <ChevronRight />
          </div>
          <p class="card-item__description">{{ entity.description || 'Tap to start collecting' }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.app-view {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
}

.top-bar__actions {
  display: flex;
  gap: 0.75rem;
}

.pill-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.25rem;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  font-weight: 600;
}

.pill-button svg {
  width: 18px;
  height: 18px;
}

.pill-button--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #1f2937;
}

.pill-button:disabled {
  opacity: 0.6;
}

.app-hero {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.app-hero__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.app-hero h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.app-hero p {
  color: #6b7280;
  margin-top: 0.35rem;
  font-size: 0.95rem;
}

.version-pill {
  background: #eef2ff;
  color: #4c51bf;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 600;
  font-size: 0.85rem;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
  font-weight: 600;
}

.status-pill--offline {
  background: rgba(234, 179, 8, 0.15);
  color: #92400e;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.status-indicator.offline {
  background: #f59e0b;
}

.status-message {
  font-size: 0.9rem;
  font-weight: 600;
}

.status-message--success {
  color: #0f766e;
}

.status-message--error {
  color: #b91c1c;
}

.app-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.stat-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stat-card__label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
}

.stat-card__value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #111827;
}

.stat-card__hint {
  font-size: 0.85rem;
  color: #6b7280;
}

.forms-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.card-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.card-item {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.card-item:active {
  transform: scale(0.99);
}

.card-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.card-item h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
}

.badge {
  margin-top: 0.35rem;
  display: inline-block;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-item__description {
  margin-top: 0.75rem;
  color: #6b7280;
  font-size: 0.95rem;
}
</style>
