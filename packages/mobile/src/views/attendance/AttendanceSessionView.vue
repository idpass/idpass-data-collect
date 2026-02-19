<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAttendanceStore } from '@/store/attendance'
import { store } from '@/store/index'
import StatusToggle from '@/components/shared/StatusToggle.vue'

type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'
type FilterTab = 'all' | 'exceptions' | 'unmarked'

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

// All entities loaded for check-in search
const allEntities = ref<MemberDisplay[]>([])
// Members loaded for roll-call mode
const groupMembers = ref<MemberDisplay[]>([])

// Check-in mode scan/search state
const showScanInput = ref(false)
const scanValue = ref('')
const showSearchInput = ref(false)
const searchQuery = ref('')

// Undo toast state: { guid, name, timer countdown }
const undoToast = ref<{ guid: string; name: string; countdown: number } | null>(null)
let undoInterval: ReturnType<typeof setInterval> | null = null

// Roll-call filter tab
const activeFilter = ref<FilterTab>('all')

// Roll-call search
const rollCallSearch = ref('')

// Mark-all-present confirmation
const showMarkAllConfirm = ref(false)

const isRollCall = computed(() => !!groupGuid)

const checkedInCount = computed(() => attendanceStore.checkInOrder.length)

const statusCounts = computed(() => {
  const counts = { present: 0, absent: 0, excused: 0, late: 0 }
  attendanceStore.memberStatuses.forEach((status) => {
    counts[status]++
  })
  return counts
})

const presentPercentage = computed(() => {
  const total = attendanceStore.memberStatuses.size
  if (!total) return 0
  return Math.round((statusCounts.value.present / total) * 100)
})

const checkedInMembers = computed<MemberDisplay[]>(() => {
  return attendanceStore.checkInOrder.map((guid) => {
    const entity = allEntities.value.find((e) => e.guid === guid)
    return entity ?? { guid, name: guid }
  })
})

const filteredEntities = computed<MemberDisplay[]>(() => {
  const query = searchQuery.value.toLowerCase()
  if (!query) return []
  return allEntities.value.filter(
    (e) => e.name.toLowerCase().includes(query) || e.guid.toLowerCase().includes(query),
  )
})

const filteredMembers = computed<MemberDisplay[]>(() => {
  const query = rollCallSearch.value.toLowerCase()
  let members = query
    ? groupMembers.value.filter(
        (m) => m.name.toLowerCase().includes(query) || m.guid.toLowerCase().includes(query),
      )
    : [...groupMembers.value]

  if (activeFilter.value === 'exceptions') {
    members = members.filter((m) => {
      const status = attendanceStore.memberStatuses.get(m.guid)
      return status && status !== 'present'
    })
  } else if (activeFilter.value === 'unmarked') {
    members = members.filter((m) => !attendanceStore.memberStatuses.has(m.guid))
  }

  return members.sort((a, b) => a.name.localeCompare(b.name))
})

const summaryPath = computed(() => {
  const sid = attendanceStore.currentSessionId
  if (groupGuid) {
    return `/app/${appId}/attendance/group/${groupGuid}/session/${sid}/summary`
  }
  return `/app/${appId}/attendance/session/${sid}/summary`
})

const onBack = () => {
  if (groupGuid) {
    router.push(`/app/${appId}/attendance/group/${groupGuid}`)
  } else {
    router.push(`/app/${appId}/attendance`)
  }
}

const handleScan = () => {
  const guid = scanValue.value.trim()
  if (!guid) return
  performCheckIn(guid)
  scanValue.value = ''
  showScanInput.value = false
}

const handleSearchCheckIn = (guid: string) => {
  performCheckIn(guid)
  showSearchInput.value = false
  searchQuery.value = ''
}

const performCheckIn = (guid: string) => {
  attendanceStore.addCheckIn(guid)
  const entity = allEntities.value.find((e) => e.guid === guid)
  const name = entity?.name ?? guid
  startUndoToast(guid, name)
}

const startUndoToast = (guid: string, name: string) => {
  if (undoInterval) clearInterval(undoInterval)
  undoToast.value = { guid, name, countdown: 5 }
  undoInterval = setInterval(() => {
    if (!undoToast.value) {
      if (undoInterval) clearInterval(undoInterval)
      return
    }
    undoToast.value.countdown--
    if (undoToast.value.countdown <= 0) {
      undoToast.value = null
      if (undoInterval) clearInterval(undoInterval)
    }
  }, 1000)
}

const undoLastCheckIn = () => {
  if (!undoToast.value) return
  attendanceStore.removeCheckIn(undoToast.value.guid)
  undoToast.value = null
  if (undoInterval) clearInterval(undoInterval)
}

const removeCheckIn = (guid: string) => {
  attendanceStore.removeCheckIn(guid)
  if (undoToast.value?.guid === guid) {
    undoToast.value = null
    if (undoInterval) clearInterval(undoInterval)
  }
}

const onStatusChange = (guid: string, status: string) => {
  attendanceStore.setMemberStatus(guid, status as AttendanceStatus)
}

const markAllPresent = () => {
  const count = groupMembers.value.length
  if (count > 30) {
    showMarkAllConfirm.value = true
    return
  }
  doMarkAllPresent()
}

const confirmMarkAllPresent = () => {
  showMarkAllConfirm.value = false
  doMarkAllPresent()
}

const doMarkAllPresent = () => {
  groupMembers.value.forEach((m) => {
    attendanceStore.setMemberStatus(m.guid, 'present')
  })
}

const navigateToSummary = () => {
  router.push(summaryPath.value)
}

onMounted(async () => {
  if (sessionId && sessionId !== 'new') {
    attendanceStore.loadDraft(sessionId)
  } else if (!attendanceStore.currentSessionId) {
    if (groupGuid) {
      await attendanceStore.startSession(
        'roll-call',
        groupGuid,
        `Roll Call — ${new Date().toLocaleDateString()}`,
      )
    } else {
      await attendanceStore.startSession('check-in')
    }
  }

  // Load all entities for check-in search
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

  // Load group members for roll-call mode
  if (groupGuid) {
    const rawMembers = await store.getMembers(groupGuid)
    groupMembers.value = (
      rawMembers as {
        modified?: { guid?: string; data?: { firstName?: string; lastName?: string; name?: string } }
      }[]
    )
      .filter((m) => m.modified?.guid)
      .map((m) => ({
        guid: m.modified!.guid!,
        name:
          [m.modified?.data?.firstName, m.modified?.data?.lastName].filter(Boolean).join(' ') ||
          m.modified?.data?.name ||
          m.modified!.guid!,
      }))
  }
})
</script>

<template>
  <div class="session-view">
    <div class="top-bar">
      <button class="icon-button" type="button" aria-label="Back" @click="onBack">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <h1 class="top-bar__title">
        {{ attendanceStore.sessionName || (isRollCall ? 'Roll Call' : 'Check-in') }}
      </h1>
      <button class="btn btn--primary" type="button" @click="navigateToSummary">Complete</button>
    </div>

    <!-- Undo toast -->
    <div v-if="undoToast" class="undo-toast" role="status" aria-live="polite">
      <span class="undo-toast__text">
        Checked in: <strong>{{ undoToast.name }}</strong>
      </span>
      <button class="undo-toast__btn" type="button" @click="undoLastCheckIn">
        Undo ({{ undoToast.countdown }}s)
      </button>
    </div>

    <!-- CHECK-IN MODE -->
    <template v-if="!isRollCall">
      <!-- Counter bar -->
      <div class="counter-bar">
        <span class="counter-bar__label">Checked in:</span>
        <span class="counter-bar__value">{{ checkedInCount }}</span>
      </div>

      <!-- Scan button -->
      <div class="scan-section">
        <div v-if="!showScanInput && !showSearchInput" class="scan-section__actions">
          <button
            class="btn-primary-large"
            type="button"
            @click="showScanInput = true; showSearchInput = false"
          >
            Scan Next Person
          </button>
          <button
            class="btn btn--outline"
            type="button"
            @click="showSearchInput = true; showScanInput = false"
          >
            Search by Name / ID
          </button>
        </div>

        <!-- Scan input (simulates scanner) -->
        <div v-if="showScanInput" class="scan-input-form">
          <label class="scan-input-form__label" for="scan-input">Enter Entity ID</label>
          <input
            id="scan-input"
            v-model="scanValue"
            class="scan-input-form__input"
            type="text"
            placeholder="Scan or enter entity GUID"
            @keyup.enter="handleScan"
          />
          <div class="scan-input-form__actions">
            <button class="btn btn--primary" type="button" @click="handleScan">Check In</button>
            <button
              class="btn btn--muted"
              type="button"
              @click="showScanInput = false; scanValue = ''"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Search input -->
        <div v-if="showSearchInput" class="search-form">
          <input
            v-model="searchQuery"
            class="search-form__input"
            type="search"
            placeholder="Search by name or ID..."
          />
          <ul v-if="filteredEntities.length > 0" class="search-results" role="listbox">
            <li
              v-for="entity in filteredEntities"
              :key="entity.guid"
              class="search-results__item"
              role="option"
              tabindex="0"
              @click="handleSearchCheckIn(entity.guid)"
              @keyup.enter="handleSearchCheckIn(entity.guid)"
            >
              {{ entity.name }}
              <span class="search-results__guid">{{ entity.guid.slice(0, 8) }}</span>
            </li>
          </ul>
          <button
            class="btn btn--muted"
            type="button"
            @click="showSearchInput = false; searchQuery = ''"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Checked-in list -->
      <section v-if="checkedInMembers.length > 0" class="checkin-list-section">
        <div class="section-title">
          <h2>Checked In ({{ checkedInMembers.length }})</h2>
        </div>
        <ul class="member-list" role="list">
          <li v-for="member in checkedInMembers" :key="member.guid" class="member-row">
            <div class="member-row__info">
              <span class="member-row__name">{{ member.name }}</span>
              <StatusToggle
                :status="attendanceStore.memberStatuses.get(member.guid) ?? 'present'"
                @change="(s) => onStatusChange(member.guid, s)"
              />
            </div>
            <button
              class="member-row__remove"
              type="button"
              aria-label="Remove check-in"
              @click="removeCheckIn(member.guid)"
            >
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </li>
        </ul>
      </section>
    </template>

    <!-- ROLL-CALL MODE -->
    <template v-else>
      <!-- Counter bar -->
      <div class="counter-bar counter-bar--rollcall">
        <span class="counter-bar__stat counter-bar__stat--green">
          Present: {{ statusCounts.present }}
        </span>
        <span class="counter-bar__stat counter-bar__stat--red">
          Absent: {{ statusCounts.absent }}
        </span>
        <span class="counter-bar__stat counter-bar__stat--blue">
          Excused: {{ statusCounts.excused }}
        </span>
        <span class="counter-bar__stat counter-bar__stat--amber">
          Late: {{ statusCounts.late }}
        </span>
        <span class="counter-bar__percent">{{ presentPercentage }}%</span>
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs" role="tablist">
        <button
          class="filter-tab"
          :class="{ 'filter-tab--active': activeFilter === 'all' }"
          role="tab"
          :aria-selected="activeFilter === 'all'"
          type="button"
          @click="activeFilter = 'all'"
        >
          All
        </button>
        <button
          class="filter-tab"
          :class="{ 'filter-tab--active': activeFilter === 'exceptions' }"
          role="tab"
          :aria-selected="activeFilter === 'exceptions'"
          type="button"
          @click="activeFilter = 'exceptions'"
        >
          Exceptions
        </button>
        <button
          class="filter-tab"
          :class="{ 'filter-tab--active': activeFilter === 'unmarked' }"
          role="tab"
          :aria-selected="activeFilter === 'unmarked'"
          type="button"
          @click="activeFilter = 'unmarked'"
        >
          Unmarked
        </button>
      </div>

      <!-- Mark All Present confirmation bar -->
      <div v-if="showMarkAllConfirm" class="confirm-card" role="alertdialog">
        <p class="confirm-card__text">
          Mark all {{ groupMembers.length }} members as present?
        </p>
        <div class="confirm-card__actions">
          <button class="btn btn--primary" type="button" @click="confirmMarkAllPresent">
            Confirm
          </button>
          <button class="btn btn--muted" type="button" @click="showMarkAllConfirm = false">
            Cancel
          </button>
        </div>
      </div>

      <!-- Roll-call toolbar -->
      <div class="rollcall-toolbar">
        <input
          v-model="rollCallSearch"
          class="rollcall-toolbar__search"
          type="search"
          placeholder="Search members..."
        />
        <button class="btn btn--muted" type="button" @click="markAllPresent">
          Mark All Present
        </button>
      </div>

      <!-- Member list -->
      <section class="rollcall-list-section">
        <ul class="member-list" role="list">
          <li v-for="member in filteredMembers" :key="member.guid" class="member-row">
            <span class="member-row__name">{{ member.name }}</span>
            <StatusToggle
              :status="attendanceStore.memberStatuses.get(member.guid) ?? 'present'"
              @change="(s) => onStatusChange(member.guid, s)"
            />
          </li>
        </ul>
        <p v-if="filteredMembers.length === 0" class="empty-state">No members match this filter.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.session-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.top-bar__title {
  flex: 1;
  font-size: 1.05rem;
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

.btn {
  padding: 0.6rem 1.1rem;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  font-size: 0.9rem;
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

.btn--outline {
  background: transparent;
  border: 1.5px solid #e2e8f0;
  color: #374151;
}

.undo-toast {
  position: sticky;
  top: 0;
  z-index: 30;
  background: #0f172a;
  color: white;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.undo-toast__text {
  font-size: 0.9rem;
}

.undo-toast__btn {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  min-height: 36px;
}

.counter-bar {
  background: #ffffff;
  border-radius: 14px;
  padding: 1rem 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.counter-bar__label {
  font-size: 0.9rem;
  color: #6b7280;
  font-weight: 500;
}

.counter-bar__value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #111827;
}

.counter-bar--rollcall {
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.counter-bar__stat {
  font-size: 0.85rem;
  font-weight: 600;
}

.counter-bar__stat--green {
  color: #16a34a;
}

.counter-bar__stat--red {
  color: #dc2626;
}

.counter-bar__stat--blue {
  color: #2563eb;
}

.counter-bar__stat--amber {
  color: #d97706;
}

.counter-bar__percent {
  margin-left: auto;
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
}

.scan-section {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.scan-section__actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
}

.scan-input-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.scan-input-form__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
}

.scan-input-form__input {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  font-size: 1rem;
  outline: none;
  min-height: 44px;
}

.scan-input-form__input:focus {
  border-color: #2563eb;
}

.scan-input-form__actions {
  display: flex;
  gap: 0.75rem;
}

.search-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.search-form__input {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  font-size: 1rem;
  outline: none;
  min-height: 44px;
}

.search-form__input:focus {
  border-color: #2563eb;
}

.search-results {
  list-style: none;
  padding: 0;
  margin: 0;
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
}

.search-results__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  min-height: 52px;
}

.search-results__item:last-child {
  border-bottom: none;
}

.search-results__item:hover,
.search-results__item:focus {
  background: #f8fafc;
  outline: none;
}

.search-results__guid {
  font-size: 0.75rem;
  color: #9ca3af;
  font-family: monospace;
}

.checkin-list-section,
.rollcall-list-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-title h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1f2937;
}

.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #ffffff;
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  gap: 0.75rem;
  min-height: 56px;
}

.member-row:last-child {
  border-bottom: none;
}

.member-row__info {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.member-row__name {
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-row__remove {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.member-row__remove svg {
  width: 18px;
  height: 18px;
}

.filter-tabs {
  display: flex;
  background: #f1f5f9;
  border-radius: 12px;
  padding: 4px;
  gap: 2px;
}

.filter-tab {
  flex: 1;
  padding: 0.5rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  min-height: 40px;
  transition: background 0.15s;
}

.filter-tab--active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
}

.rollcall-toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.rollcall-toolbar__search {
  flex: 1;
  padding: 0.65rem 1rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  font-size: 0.95rem;
  outline: none;
  min-height: 44px;
}

.rollcall-toolbar__search:focus {
  border-color: #2563eb;
}

.empty-state {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

.confirm-card {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.confirm-card__text {
  font-size: 0.9rem;
  color: #92400e;
  font-weight: 600;
  margin: 0;
}

.confirm-card__actions {
  display: flex;
  gap: 0.75rem;
}
</style>
