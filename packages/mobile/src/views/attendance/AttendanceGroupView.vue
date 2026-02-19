<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAttendanceStore } from '@/store/attendance'
import { store } from '@/store/index'
import { useErrorHandler } from '@/composables/useErrorHandler'

type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'

interface Member {
  guid: string
  name: string
  status?: AttendanceStatus
}

const route = useRoute()
const router = useRouter()
const appId = route.params.id as string
const groupGuid = route.params.groupGuid as string

const attendanceStore = useAttendanceStore()
const { handleAuthError } = useErrorHandler(appId)

const groupName = ref<string>('')
const members = ref<Member[]>([])
const isLoading = ref(true)

const pendingDraft = ref<{ sessionId: string; sessionName: string; count: number } | null>(null)

const attendancePercentage = computed(() => {
  if (!members.value.length) return 0
  const present = members.value.filter((m) => m.status === 'present').length
  return Math.round((present / members.value.length) * 100)
})

const onBack = () => {
  router.push(`/app/${appId}/attendance`)
}

const onLogout = async () => {
  await handleAuthError(appId)
}

const startNewSession = async () => {
  const name = `Roll Call — ${new Date().toLocaleDateString()}`
  await attendanceStore.startSession('roll-call', groupGuid, name)
  router.push(`/app/${appId}/attendance/group/${groupGuid}/session`)
}

const resumeDraft = () => {
  if (!pendingDraft.value) return
  const { sessionId } = pendingDraft.value
  attendanceStore.loadDraft(sessionId)
  router.push(`/app/${appId}/attendance/group/${groupGuid}/session/${sessionId}`)
  pendingDraft.value = null
}

const discardDraftAndDismiss = () => {
  if (!pendingDraft.value) return
  attendanceStore.discardDraft(pendingDraft.value.sessionId)
  pendingDraft.value = null
}

onMounted(async () => {
  try {
    const entities = (await store.getAllEntities()) as {
      modified?: {
        guid?: string
        entityName?: string
        data?: { name?: string; memberCount?: number }
      }
    }[]
    const groupEntity = entities.find(
      (e) => e.modified?.guid === groupGuid && e.modified?.entityName === 'group',
    )
    groupName.value = groupEntity?.modified?.data?.name ?? groupGuid

    const rawMembers = await store.getMembers(groupGuid)
    members.value = (
      rawMembers as {
        modified?: {
          guid?: string
          data?: {
            firstName?: string
            lastName?: string
            name?: string
            attendance?: { status?: AttendanceStatus }
          }
        }
      }[]
    )
      .filter((m) => m.modified?.guid)
      .map((m) => ({
        guid: m.modified!.guid!,
        name:
          [m.modified?.data?.firstName, m.modified?.data?.lastName].filter(Boolean).join(' ') ||
          m.modified?.data?.name ||
          m.modified!.guid!,
        status: m.modified?.data?.attendance?.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    isLoading.value = false
  }

  // Check for a draft that belongs to this group
  const draft = attendanceStore.hasPendingDraft()
  if (draft) {
    const raw = localStorage.getItem(`attendance-draft-${draft.sessionId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.currentGroupGuid === groupGuid) {
        pendingDraft.value = draft
      }
    }
  }
})
</script>

<template>
  <div class="group-view">
    <div class="top-bar">
      <button class="icon-button" type="button" aria-label="Back" @click="onBack">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <h1 class="top-bar__title">{{ groupName || 'Group' }}</h1>
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

    <div v-if="isLoading" class="loading-state">Loading group...</div>

    <template v-else>
      <section class="group-hero">
        <div class="group-hero__stats">
          <div class="stat-card">
            <span class="stat-card__label">Members</span>
            <span class="stat-card__value">{{ members.length }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__label">Present</span>
            <span class="stat-card__value stat-card__value--green">
              {{ attendancePercentage }}%
            </span>
          </div>
        </div>
      </section>

      <section v-if="pendingDraft" class="draft-banner">
        <div class="draft-banner__info">
          <span class="draft-banner__label">Draft session</span>
          <span class="draft-banner__name">{{ pendingDraft.sessionName || 'Unnamed' }}</span>
          <span class="draft-banner__count">{{ pendingDraft.count }} marked</span>
        </div>
        <div class="draft-banner__actions">
          <button class="btn btn--primary btn--sm" type="button" @click="resumeDraft">
            Resume
          </button>
          <button class="btn btn--muted btn--sm" type="button" @click="discardDraftAndDismiss">
            Discard
          </button>
        </div>
      </section>

      <section class="action-section">
        <button class="btn-primary-large" type="button" @click="startNewSession">
          New Session
        </button>
        <p class="btn-subtitle">Start a new roll-call for this group</p>
      </section>

      <section v-if="members.length > 0" class="members-section">
        <div class="section-title">
          <h2>Members ({{ members.length }})</h2>
        </div>
        <ul class="member-list" role="list">
          <li v-for="member in members" :key="member.guid" class="member-item">
            <span class="member-item__name">{{ member.name }}</span>
            <span
              v-if="member.status"
              class="member-item__status"
              :class="`member-item__status--${member.status}`"
            >
              {{ member.status }}
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.group-view {
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  flex-shrink: 0;
  white-space: nowrap;
}

.pill-button svg {
  width: 18px;
  height: 18px;
}

.pill-button--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #1f2937;
}

.loading-state {
  color: #6b7280;
  text-align: center;
  padding: 2rem;
}

.group-hero {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.group-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.stat-card {
  background: #f8fafc;
  border-radius: 14px;
  padding: 1rem;
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
  font-size: 1.6rem;
  font-weight: 700;
  color: #111827;
}

.stat-card__value--green {
  color: #16a34a;
}

.draft-banner {
  background: rgba(245, 158, 11, 0.1);
  border: 1.5px solid rgba(245, 158, 11, 0.4);
  border-radius: 16px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.draft-banner__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.draft-banner__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #92400e;
}

.draft-banner__name {
  font-weight: 700;
  color: #111827;
}

.draft-banner__count {
  font-size: 0.85rem;
  color: #6b7280;
}

.draft-banner__actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.action-section {
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

.btn {
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  min-height: 44px;
}

.btn--sm {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  min-height: 38px;
}

.btn--primary {
  background: #2563eb;
  color: white;
}

.btn--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #374151;
}

.members-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.member-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  margin: 0;
  background: #ffffff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  min-height: 56px;
}

.member-item:last-child {
  border-bottom: none;
}

.member-item__name {
  font-weight: 500;
  color: #111827;
}

.member-item__status {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: capitalize;
}

.member-item__status--present {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.member-item__status--absent {
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.member-item__status--excused {
  background: rgba(37, 99, 235, 0.12);
  color: #1e40af;
}

.member-item__status--late {
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}
</style>
