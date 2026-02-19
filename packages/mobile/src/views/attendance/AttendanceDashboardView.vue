<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { useAttendanceStore } from '@/store/attendance'
import { store } from '@/store/index'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { isOnline, onNetworkChange } from '@/utils/networkUtils'
import ConnectivityBanner from '@/components/shared/ConnectivityBanner.vue'
import type { TenantAppData } from '@/schemas/tenantApp.schema'

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string

const tenantStore = useTenantStore()
const attendanceStore = useAttendanceStore()
const { handleAuthError } = useErrorHandler(appId)

const tenantapp = ref<TenantAppData | null>(null)
const groups = ref<{ guid: string; name: string; memberCount: number }[]>([])
const pendingCount = ref(0)
const isOffline = ref(false)
const isSyncing = ref(false)
const lastSyncTime = ref<string | undefined>(undefined)
let networkCleanup: (() => void) | null = null

const pendingDraft = ref<{ sessionId: string; sessionName: string; count: number } | null>(null)
const pendingDrafts = ref<Array<{ sessionId: string; sessionName: string; count: number }>>([])
// Single-draft ref is used by resumeDraft/discardDraftAndDismiss logic below
// pendingDrafts shows all drafts in the recovery UI

const showSessionNameInput = ref(false)
const newSessionName = ref('')
const confirmingDiscardId = ref<string | null>(null)

const formattedVersion = computed(() => `v${tenantapp.value?.version ?? '—'}`)

const onBack = () => {
  router.push({ name: 'home' })
}

const onSync = async () => {
  if (isOffline.value) return
  try {
    isSyncing.value = true
    await store.syncWithSyncServer()
    lastSyncTime.value = new Date().toLocaleTimeString()
    pendingCount.value = await store.getUnsyncedEventsCount()
  } finally {
    isSyncing.value = false
  }
}

const onLogout = async () => {
  await handleAuthError(appId)
}

const loadData = async () => {
  const [entities, unsynced] = await Promise.all([
    store.getAllEntities(),
    store.getUnsyncedEventsCount(),
  ])
  pendingCount.value = unsynced
  groups.value = (entities as { modified?: { guid?: string; entityName?: string; data?: { name?: string; memberCount?: number } } }[])
    .filter((e) => e.modified?.entityName === 'group')
    .map((e) => ({
      guid: e.modified?.guid ?? '',
      name: e.modified?.data?.name ?? e.modified?.guid ?? 'Group',
      memberCount: e.modified?.data?.memberCount ?? 0,
    }))
}

const startNewSession = async () => {
  const name = newSessionName.value.trim()
  if (!name) return
  await attendanceStore.startSession('check-in', undefined, name)
  showSessionNameInput.value = false
  newSessionName.value = ''
  router.push(`/app/${appId}/attendance/session/${attendanceStore.currentSessionId}`)
}

const resumeDraft = (draft?: { sessionId: string }) => {
  const target = draft ?? pendingDraft.value
  if (!target) return
  const { sessionId } = target
  attendanceStore.loadDraft(sessionId)
  router.push(`/app/${appId}/attendance/session/${sessionId}`)
  pendingDrafts.value = pendingDrafts.value.filter((d) => d.sessionId !== sessionId)
  if (pendingDraft.value?.sessionId === sessionId) {
    pendingDraft.value = pendingDrafts.value[0] ?? null
  }
}

const requestDiscardDraft = (draft?: { sessionId: string }) => {
  const target = draft ?? pendingDraft.value
  if (!target) return
  confirmingDiscardId.value = target.sessionId
}

const confirmDiscardDraft = () => {
  const sessionId = confirmingDiscardId.value
  if (!sessionId) return
  confirmingDiscardId.value = null
  attendanceStore.discardDraft(sessionId)
  pendingDrafts.value = pendingDrafts.value.filter((d) => d.sessionId !== sessionId)
  if (pendingDraft.value?.sessionId === sessionId) {
    pendingDraft.value = pendingDrafts.value[0] ?? null
  }
}

const cancelDiscard = () => {
  confirmingDiscardId.value = null
}

const navigateToGroup = (guid: string) => {
  router.push(`/app/${appId}/attendance/group/${guid}`)
}

onMounted(async () => {
  isOffline.value = !(await isOnline())
  networkCleanup = onNetworkChange((online: boolean) => {
    isOffline.value = !online
  })
  const tenant = await tenantStore.getTenant(appId)
  tenantapp.value = tenant
  await loadData()
  pendingDrafts.value = attendanceStore.getAllPendingDrafts()
  pendingDraft.value = pendingDrafts.value[0] ?? null
})

onUnmounted(() => {
  if (networkCleanup) networkCleanup()
})
</script>

<template>
  <div class="attendance-dashboard">
    <ConnectivityBanner :last-sync-time="lastSyncTime" />

    <!-- Draft recovery modal — shows all pending drafts so none are silently lost -->
    <div v-if="pendingDrafts.length > 0" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-card">
        <h2 class="modal-card__title">Resume Session?</h2>
        <div
          v-for="draft in pendingDrafts"
          :key="draft.sessionId"
          class="draft-card"
        >
          <p class="modal-card__body">
            Resume <strong>{{ draft.sessionName || 'Unnamed Session' }}</strong> with
            {{ draft.count }} checked in?
          </p>
          <div class="modal-card__actions">
            <button class="btn btn--primary" type="button" @click="resumeDraft(draft)">Resume</button>
            <button class="btn btn--muted" type="button" @click="requestDiscardDraft(draft)">
              Discard
            </button>
          </div>
          <div
            v-if="confirmingDiscardId === draft.sessionId"
            class="discard-confirm"
            role="alertdialog"
          >
            <p class="discard-confirm__text">Are you sure? This cannot be undone.</p>
            <div class="discard-confirm__actions">
              <button class="btn btn--danger" type="button" @click="confirmDiscardDraft">
                Confirm Discard
              </button>
              <button class="btn btn--muted" type="button" @click="cancelDiscard">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="top-bar">
      <button class="icon-button" type="button" aria-label="Back" @click="onBack">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <div class="top-bar__actions">
        <button class="pill-button" type="button" :disabled="isSyncing" @click="onSync">
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
            <path
              d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"
              fill="currentColor"
            />
          </svg>
          Logout
        </button>
      </div>
    </div>

    <section v-if="tenantapp" class="app-hero">
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
          {{ isOffline ? 'Offline mode' : 'Online' }}
        </span>
        <span v-if="pendingCount > 0" class="status-pill status-pill--pending">
          {{ pendingCount }} pending sync
        </span>
      </div>
    </section>

    <section class="app-stats">
      <div class="stat-card">
        <span class="stat-card__label">Groups</span>
        <span class="stat-card__value">{{ groups.length }}</span>
        <span class="stat-card__hint">available</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Pending</span>
        <span class="stat-card__value">{{ pendingCount }}</span>
        <span class="stat-card__hint">to sync</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Draft</span>
        <span class="stat-card__value">{{ pendingDrafts.length }}</span>
        <span class="stat-card__hint">session</span>
      </div>
    </section>

    <section class="check-in-section">
      <div v-if="!showSessionNameInput">
        <button class="btn-primary-large" type="button" @click="showSessionNameInput = true">
          New Check-in Session
        </button>
        <p class="btn-subtitle">Scan people as they arrive</p>
      </div>
      <div v-else class="session-name-form">
        <label class="session-name-form__label" for="session-name">Session Name</label>
        <input
          id="session-name"
          v-model="newSessionName"
          class="session-name-form__input"
          type="text"
          placeholder="e.g. Morning Check-in"
          @keyup.enter="startNewSession"
        />
        <div class="session-name-form__actions">
          <button class="btn btn--primary" type="button" @click="startNewSession">
            Start Session
          </button>
          <button
            class="btn btn--muted"
            type="button"
            @click="showSessionNameInput = false; newSessionName = ''"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>

    <section v-if="groups.length > 0" class="groups-section">
      <div class="section-title">
        <h2>Groups ({{ groups.length }})</h2>
        <p class="section-subtitle">Mark attendance from a roster</p>
      </div>
      <ul class="card-list" role="list">
        <li
          v-for="group in groups"
          :key="group.guid"
          class="card-item"
          role="button"
          tabindex="0"
          @click="navigateToGroup(group.guid)"
          @keyup.enter="navigateToGroup(group.guid)"
        >
          <div class="card-item__header">
            <div>
              <h3>{{ group.name }}</h3>
              <span class="badge">{{ group.memberCount }} members</span>
            </div>
            <svg class="chevron" viewBox="0 0 24 24" focusable="false">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor" />
            </svg>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.attendance-dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal-card {
  background: white;
  border-radius: 20px;
  padding: 28px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
}

.modal-card__title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.75rem;
}

.modal-card__body {
  color: #4b5563;
  margin: 0 0 1.25rem;
}

.modal-card__actions {
  display: flex;
  gap: 0.75rem;
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
  cursor: pointer;
}

.icon-button svg {
  width: 22px;
  height: 22px;
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
  cursor: pointer;
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
  cursor: not-allowed;
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
  white-space: nowrap;
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
  font-size: 0.85rem;
}

.status-pill--offline {
  background: rgba(234, 179, 8, 0.15);
  color: #92400e;
}

.status-pill--pending {
  background: rgba(245, 158, 11, 0.15);
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
  font-size: 0.8rem;
  color: #6b7280;
}

.check-in-section {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.btn-primary-large {
  width: 100%;
  padding: 1rem;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  min-height: 56px;
  letter-spacing: 0.01em;
}

.btn-subtitle {
  text-align: center;
  color: #6b7280;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.session-name-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.session-name-form__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.session-name-form__input {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  font-size: 1rem;
  outline: none;
  min-height: 44px;
}

.session-name-form__input:focus {
  border-color: #2563eb;
}

.session-name-form__actions {
  display: flex;
  gap: 0.75rem;
}

.btn {
  flex: 1;
  padding: 0.75rem;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  min-height: 44px;
}

.btn--primary {
  background: #2563eb;
  color: white;
}

.btn--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #374151;
}

.groups-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.section-subtitle {
  color: #6b7280;
  font-size: 0.9rem;
  margin-top: 0.25rem;
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
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.card-item h3 {
  font-size: 1.05rem;
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

.chevron {
  width: 22px;
  height: 22px;
  color: #9ca3af;
  flex-shrink: 0;
}

.draft-card {
  margin-bottom: 0.5rem;
}

.discard-confirm {
  margin-top: 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 0.75rem;
}

.discard-confirm__text {
  font-size: 0.85rem;
  color: #991b1b;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.discard-confirm__actions {
  display: flex;
  gap: 0.75rem;
}

.btn--danger {
  background: #ef4444;
  color: white;
}
</style>
