<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAttendanceStore } from '@/store/attendance'
import { useAuthManagerStore } from '@/store/authManager'
import { store } from '@/store/index'
import ProgressOverlay from '@/components/shared/ProgressOverlay.vue'

interface MemberDisplay {
  guid: string
  name: string
}

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string
const sessionId = route.params.sessionId as string | undefined
const groupGuid = route.params.groupGuid as string | undefined

const attendanceStore = useAttendanceStore()
const authManagerStore = useAuthManagerStore()

const allEntities = ref<MemberDisplay[]>([])
const isSubmitting = ref(false)
const errorMessage = ref('')

const sessionPath = computed(() => {
  if (groupGuid) {
    return `/app/${appId}/attendance/group/${groupGuid}/session/${sessionId}`
  }
  return `/app/${appId}/attendance/session/${sessionId}`
})

const statusCounts = computed(() => {
  const counts = { present: 0, absent: 0, excused: 0, late: 0, total: 0 }
  attendanceStore.memberStatuses.forEach((status) => {
    counts[status]++
    counts.total++
  })
  return counts
})

const exceptions = computed<{ guid: string; name: string; status: string }[]>(() => {
  const result: { guid: string; name: string; status: string }[] = []
  attendanceStore.memberStatuses.forEach((status, guid) => {
    if (status !== 'present') {
      const entity = allEntities.value.find((e) => e.guid === guid)
      result.push({ guid, name: entity?.name ?? guid, status })
    }
  })
  return result.sort((a, b) => a.name.localeCompare(b.name))
})

const sessionDateFormatted = computed(() => {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

const onEdit = () => {
  router.push(sessionPath.value)
}

const onSubmit = async () => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    // Retrieve the current user identity from the auth store, falling back to
    // 'anonymous' when no authenticated session is available.
    const userId = authManagerStore.currentProvider ?? 'anonymous'
    if (!authManagerStore.currentProvider) {
      console.warn('No authenticated user found; using anonymous as userId for attendance submission')
    }
    await attendanceStore.submitSession(store, userId)
    attendanceStore.resetSession()
    if (groupGuid) {
      router.push(`/app/${appId}/attendance/group/${groupGuid}`)
    } else {
      router.push(`/app/${appId}/attendance`)
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to submit attendance'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  if (sessionId && !attendanceStore.currentSessionId) {
    attendanceStore.loadDraft(sessionId)
  }

  const entities = (await store.getAllEntities()) as {
    modified?: { guid?: string; data?: { firstName?: string; lastName?: string; name?: string } }
  }[]
  allEntities.value = entities
    .filter((e) => e.modified?.guid)
    .map((e) => ({
      guid: e.modified!.guid!,
      name:
        [e.modified?.data?.firstName, e.modified?.data?.lastName].filter(Boolean).join(' ') ||
        e.modified?.data?.name ||
        e.modified!.guid!,
    }))
})
</script>

<template>
  <div class="summary-view">
    <ProgressOverlay
      :visible="isSubmitting"
      :current="attendanceStore.savedCount"
      :total="attendanceStore.totalToSave"
      label="Submitting attendance..."
    />

    <div class="top-bar">
      <button class="icon-button" type="button" aria-label="Back" @click="onEdit">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <h1 class="top-bar__title">Review & Submit</h1>
    </div>

    <section class="session-info">
      <h2 class="session-info__name">
        {{ attendanceStore.sessionName || (groupGuid ? 'Roll Call' : 'Check-in Session') }}
      </h2>
      <p class="session-info__date">{{ sessionDateFormatted }}</p>
      <span class="session-info__mode">
        {{ attendanceStore.mode === 'roll-call' ? 'Roll Call' : 'Check-in' }}
      </span>
    </section>

    <section class="summary-card">
      <h2 class="summary-card__title">Attendance Summary</h2>
      <div class="summary-grid">
        <div class="summary-item summary-item--present">
          <span class="summary-item__count">{{ statusCounts.present }}</span>
          <span class="summary-item__label">Present</span>
        </div>
        <div class="summary-item summary-item--absent">
          <span class="summary-item__count">{{ statusCounts.absent }}</span>
          <span class="summary-item__label">Absent</span>
        </div>
        <div class="summary-item summary-item--excused">
          <span class="summary-item__count">{{ statusCounts.excused }}</span>
          <span class="summary-item__label">Excused</span>
        </div>
        <div class="summary-item summary-item--late">
          <span class="summary-item__count">{{ statusCounts.late }}</span>
          <span class="summary-item__label">Late</span>
        </div>
      </div>
      <div class="summary-total">
        <span class="summary-total__label">Total recorded</span>
        <span class="summary-total__value">{{ statusCounts.total }}</span>
      </div>
    </section>

    <section v-if="exceptions.length > 0" class="exceptions-section">
      <div class="section-title">
        <h2>Exceptions ({{ exceptions.length }})</h2>
        <p class="section-subtitle">Members not marked present</p>
      </div>
      <ul class="exceptions-list" role="list">
        <li v-for="exception in exceptions" :key="exception.guid" class="exception-item">
          <span class="exception-item__name">{{ exception.name }}</span>
          <span
            class="exception-item__status"
            :class="`exception-item__status--${exception.status}`"
          >
            {{ exception.status }}
          </span>
        </li>
      </ul>
    </section>

    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

    <div class="action-row">
      <button class="btn btn--muted" type="button" @click="onEdit">Edit</button>
      <button
        class="btn btn--submit"
        type="button"
        :disabled="isSubmitting || statusCounts.total === 0"
        @click="onSubmit"
      >
        Submit
      </button>
    </div>
  </div>
</template>

<style scoped>
.summary-view {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.top-bar__title {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
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
  flex-shrink: 0;
}

.icon-button svg {
  width: 22px;
  height: 22px;
}

.session-info {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.session-info__name {
  font-size: 1.3rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.session-info__date {
  color: #6b7280;
  margin: 0;
  font-size: 0.95rem;
}

.session-info__mode {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  align-self: flex-start;
}

.summary-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.summary-card__title {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem 0.5rem;
  border-radius: 14px;
}

.summary-item--present {
  background: rgba(34, 197, 94, 0.1);
}

.summary-item--absent {
  background: rgba(239, 68, 68, 0.1);
}

.summary-item--excused {
  background: rgba(37, 99, 235, 0.1);
}

.summary-item--late {
  background: rgba(245, 158, 11, 0.1);
}

.summary-item__count {
  font-size: 1.6rem;
  font-weight: 700;
  color: #111827;
}

.summary-item__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: capitalize;
}

.summary-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-radius: 12px;
}

.summary-total__label {
  font-weight: 600;
  color: #374151;
}

.summary-total__value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
}

.exceptions-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1f2937;
}

.section-subtitle {
  color: #6b7280;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.exceptions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #ffffff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.exception-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  min-height: 56px;
  gap: 1rem;
}

.exception-item:last-child {
  border-bottom: none;
}

.exception-item__name {
  font-weight: 500;
  color: #111827;
}

.exception-item__status {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
}

.exception-item__status--absent {
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.exception-item__status--excused {
  background: rgba(37, 99, 235, 0.12);
  color: #1e40af;
}

.exception-item__status--late {
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.action-row {
  display: flex;
  gap: 0.75rem;
}

.btn {
  flex: 1;
  padding: 0.9rem;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  min-height: 52px;
}

.btn--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #374151;
}

.btn--submit {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
}

.btn--submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  color: #b91c1c;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
  padding: 0.5rem;
  background: #fee2e2;
  border-radius: 8px;
}
</style>
