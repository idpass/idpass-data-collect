<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { AxiosError } from 'axios'
import { getSyncStatus, getSyncEvents, externalSync as externalSyncApi, getSyncJobStatus, cancelSyncJob } from '@/api'

interface SyncEvent {
  id: number
  configId: string
  status: 'success' | 'partial' | 'failed'
  pushed: number
  pulled: number
  failed: number
  skipped: number
  durationMs: number
  errors: Array<{ entityGuid?: string; code: string; message: string }> | null
  triggeredBy: string
  createdAt: string
  jobId: string | null
  phase: string | null
  startedAt: string | null
  updatedAt: string | null
  errorMessage: string | null
}

const props = defineProps<{
  configId: string
  hasExternalSync: boolean
  requiresCredentials: boolean
}>()

const emit = defineEmits<{
  'sync-completed': []
  'request-credentials': []
}>()

const isSyncing = ref(false)
const isExpanded = ref(false)
const lastEvent = ref<SyncEvent | null>(null)
const history = ref<SyncEvent[]>([])
const historyLoaded = ref(false)
const elapsedSeconds = ref(0)
const expandedEventId = ref<number | null>(null)
const activeJobId = ref<string | null>(null)
const currentPhase = ref<string | null>(null)
const livePushed = ref(0)
const livePulled = ref(0)
const liveFailed = ref(0)
let pollingTimer: ReturnType<typeof setInterval> | null = null

let elapsedTimer: ReturnType<typeof setInterval> | null = null

const statusDot = computed(() => {
  if (isSyncing.value) return { color: '#1E88E5', pulse: true }
  if (!lastEvent.value) return { color: '#78909C', pulse: false }
  const map: Record<string, { color: string; pulse: boolean }> = {
    success: { color: '#4CAF50', pulse: false },
    partial: { color: '#FF9800', pulse: false },
    failed: { color: '#E53935', pulse: false },
  }
  return map[lastEvent.value.status] || { color: '#78909C', pulse: false }
})

const statusLabel = computed(() => {
  if (isSyncing.value) {
    if (currentPhase.value === 'pulling') return 'Pulling'
    return 'Pushing'
  }
  return 'Idle'
})

const lastSyncSummary = computed(() => {
  if (!lastEvent.value) return 'No sync history'
  const ago = timeAgo(lastEvent.value.createdAt)
  return `Last sync: ${ago} \u2014 ${lastEvent.value.pushed} pushed, ${lastEvent.value.pulled} pulled`
})

const panelBorderColor = computed(() => {
  if (isSyncing.value) return '#BBDEFB'
  if (!lastEvent.value) return '#E0E0E0'
  const map: Record<string, string> = {
    success: '#E8F5E9',
    partial: '#FFF3E0',
    failed: '#FFEBEE',
  }
  return map[lastEvent.value.status] || '#E0E0E0'
})

const hasHistory = computed(() => lastEvent.value !== null)

const lastSyncRelativeTime = computed(() => {
  if (!lastEvent.value) return 'No sync history'
  return `Last sync: ${timeAgo(lastEvent.value.createdAt)}`
})

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimestamp(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate))
}

function statusChipColor(status: string): string {
  const map: Record<string, string> = { success: 'success', partial: 'warning', failed: 'error' }
  return map[status] || 'grey'
}

function statusChipLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function startElapsedTimer() {
  elapsedSeconds.value = 0
  elapsedTimer = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

function startPolling() {
  stopPolling()
  pollingTimer = setInterval(async () => {
    if (!activeJobId.value) return
    try {
      const job = await getSyncJobStatus(activeJobId.value)
      currentPhase.value = job.phase
      livePushed.value = job.pushed ?? 0
      livePulled.value = job.pulled ?? 0
      liveFailed.value = job.failed ?? 0

      if (job.phase === 'completed' || job.phase === 'failed' || job.phase === 'cancelled') {
        stopPolling()
        stopElapsedTimer()
        isSyncing.value = false
        activeJobId.value = null
        currentPhase.value = null

        // Refresh status and history from server
        await fetchStatus()
        historyLoaded.value = false

        if (job.phase === 'completed') {
          emit('sync-completed')
        }
      }
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        return  // Not yet in DB — will retry on next poll interval
      }
      console.error('Failed to poll sync job status', err)
      stopPolling()
      stopElapsedTimer()
      isSyncing.value = false
      activeJobId.value = null
      currentPhase.value = null
    }
  }, 2000)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

async function fetchStatus() {
  if (!props.hasExternalSync) return
  try {
    const data = await getSyncStatus(props.configId)
    lastEvent.value = data.lastEvent

    // Resume polling if there's an active job
    if (data.activeJob && data.activeJob.phase && !['completed', 'failed', 'cancelled'].includes(data.activeJob.phase)) {
      isSyncing.value = true
      activeJobId.value = data.activeJob.jobId
      currentPhase.value = data.activeJob.phase
      livePushed.value = data.activeJob.pushed ?? 0
      livePulled.value = data.activeJob.pulled ?? 0
      liveFailed.value = data.activeJob.failed ?? 0
      startElapsedTimer()
      startPolling()
    } else {
      isSyncing.value = false
    }
  } catch (err) {
    console.error('Failed to fetch sync status', err)
  }
}

async function fetchHistory() {
  try {
    const data = await getSyncEvents(props.configId)
    history.value = data.events
    historyLoaded.value = true
  } catch (err) {
    console.error('Failed to fetch sync history', err)
  }
}

async function toggleExpand() {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value && !historyLoaded.value) {
    await fetchHistory()
  }
}

function toggleEventDetail(eventId: number) {
  expandedEventId.value = expandedEventId.value === eventId ? null : eventId
}

async function handleTriggerSync() {
  if (isSyncing.value) return
  if (props.requiresCredentials) {
    emit('request-credentials')
    return
  }
  await executeSync()
}

async function executeSync(credentials?: { username: string; password: string }) {
  isSyncing.value = true
  livePushed.value = 0
  livePulled.value = 0
  liveFailed.value = 0
  currentPhase.value = 'pending'
  startElapsedTimer()

  try {
    const result = await externalSyncApi(props.configId, credentials)
    activeJobId.value = result.jobId
    startPolling()
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 409) {
      // Already syncing — fetch status to get the active job
      await fetchStatus()
      return
    }
    isSyncing.value = false
    stopElapsedTimer()
    console.error('Failed to trigger sync', err)
  }
}

async function handleCancel() {
  if (!activeJobId.value) return
  try {
    await cancelSyncJob(activeJobId.value)
  } catch (err) {
    console.error('Failed to cancel sync', err)
  }
}

function triggerWithCredentials(credentials: { username: string; password: string }) {
  executeSync(credentials)
}

defineExpose({ lastEvent, isSyncing, lastSyncRelativeTime, triggerWithCredentials })

onMounted(fetchStatus)
onUnmounted(() => {
  stopElapsedTimer()
  stopPolling()
})

watch(() => props.configId, () => {
  historyLoaded.value = false
  history.value = []
  isExpanded.value = false
  fetchStatus()
})
</script>

<template>
  <div v-if="hasExternalSync" class="sync-panel" :style="{ borderBottomColor: panelBorderColor }">
    <div class="sync-panel__bar">
      <div class="sync-panel__status">
        <span
          class="sync-panel__dot"
          :class="{ 'sync-panel__dot--pulse': statusDot.pulse }"
          :style="{ backgroundColor: statusDot.color }"
        />
        <span class="sync-panel__label">{{ statusLabel }}</span>

        <span v-if="isSyncing" class="sync-panel__elapsed">
          {{ statusLabel }}... {{ elapsedSeconds }}s
          <span v-if="livePushed > 0 || livePulled > 0" class="sync-panel__live-counts">
            &mdash; {{ livePushed }} pushed, {{ livePulled }} pulled
            <span v-if="liveFailed > 0" class="text-error">, {{ liveFailed }} failed</span>
          </span>
        </span>
        <span v-else class="sync-panel__summary">
          {{ lastSyncSummary }}
        </span>

        <button
          v-if="hasHistory"
          data-testid="history-toggle"
          class="sync-panel__history-toggle"
          @click="toggleExpand"
        >
          {{ isExpanded ? '\u25B2 Hide History' : '\u25BC History' }}
        </button>
      </div>

      <v-btn
        data-testid="trigger-sync-btn"
        variant="flat"
        color="primary"
        size="small"
        prepend-icon="mdi-sync"
        :loading="isSyncing"
        :disabled="isSyncing"
        @click="handleTriggerSync"
      >
        {{ isSyncing ? 'Syncing...' : 'Trigger Sync' }}
      </v-btn>
      <v-btn
        v-if="isSyncing"
        data-testid="cancel-sync-btn"
        variant="text"
        color="error"
        size="small"
        @click="handleCancel"
      >
        Cancel
      </v-btn>
    </div>

    <v-progress-linear v-if="isSyncing" color="primary" indeterminate height="3" />

    <div v-if="isExpanded" class="sync-panel__history">
      <v-table density="comfortable" class="sync-history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th class="text-right">Pushed</th>
            <th class="text-right">Pulled</th>
            <th class="text-right">Failed</th>
            <th class="text-right">Duration</th>
            <th style="width: 40px" />
          </tr>
        </thead>
        <tbody>
          <template v-for="event in history" :key="event.id">
            <tr>
              <td class="text-medium-emphasis">{{ formatTimestamp(event.createdAt) }}</td>
              <td>
                <v-chip :color="statusChipColor(event.status)" size="x-small" variant="tonal">
                  {{ statusChipLabel(event.status) }}
                </v-chip>
              </td>
              <td class="text-right font-weight-medium">{{ event.pushed }}</td>
              <td class="text-right font-weight-medium">{{ event.pulled }}</td>
              <td class="text-right font-weight-medium" :class="{ 'text-error': event.failed > 0 }">
                {{ event.failed }}
              </td>
              <td class="text-right text-medium-emphasis">{{ formatDuration(event.durationMs) }}</td>
              <td>
                <v-btn
                  v-if="event.errors && event.errors.length > 0"
                  icon="mdi-chevron-down"
                  size="x-small"
                  variant="text"
                  :class="{ 'rotate-180': expandedEventId === event.id }"
                  @click="toggleEventDetail(event.id)"
                />
              </td>
            </tr>
            <tr v-if="expandedEventId === event.id && event.errors">
              <td colspan="7" class="sync-panel__error-detail">
                <div v-for="(error, idx) in event.errors" :key="idx" class="sync-panel__error-row">
                  <code v-if="error.entityGuid" class="sync-panel__error-guid">
                    {{ error.entityGuid.substring(0, 8) }}...
                  </code>
                  <v-chip size="x-small" variant="outlined" class="mx-1">{{ error.code }}</v-chip>
                  <span class="text-medium-emphasis">{{ error.message }}</span>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="history.length === 0">
            <td colspan="7" class="text-center text-medium-emphasis pa-4">
              No sync events recorded yet.
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>
  </div>
</template>

<style scoped>
.sync-panel {
  border-bottom: 2px solid #E0E0E0;
  background: rgb(var(--v-theme-surface));
  margin-bottom: var(--spacing-lg, 16px);
}

.sync-panel__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  gap: 12px;
}

.sync-panel__status {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sync-panel__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sync-panel__dot--pulse {
  animation: dotPulse 1.5s ease-in-out infinite;
}

@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.sync-panel__label {
  font-size: 13px;
  font-weight: 500;
}

.sync-panel__elapsed,
.sync-panel__summary {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.sync-panel__history-toggle {
  font-size: 11px;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.sync-panel__history-toggle:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.sync-panel__history {
  padding: 0 0 8px;
}

.sync-history-table thead th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.sync-panel__error-detail {
  background: rgba(var(--v-theme-on-surface), 0.03);
  padding: 8px 16px !important;
}

.sync-panel__error-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
}

.sync-panel__error-guid {
  font-family: monospace;
  font-size: 11px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  padding: 1px 6px;
  border-radius: 3px;
}

.sync-panel__live-counts {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.rotate-180 {
  transform: rotate(180deg);
}
</style>
