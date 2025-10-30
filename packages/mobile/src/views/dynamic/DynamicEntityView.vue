<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { SyncLevel } from '@idpass/data-collect-core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type SubmissionSnapshot = {
  lastUpdated: string
  version: number
  data: Record<string, unknown>
  name?: string
}

type SubmissionStatus = 'synced' | 'pending' | 'draft' | 'unknown'

type SubmissionRecord = {
  guid: string
  initial: SubmissionSnapshot
  modified: SubmissionSnapshot
  status: SubmissionStatus
}

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const submissions = ref<SubmissionRecord[]>([])

const searchTerm = ref('')

const props = defineProps<{
  id: string
  parentGuid: string
  entity: string
}>()

const resolveStatusSync = (
  snapshot: { initial: SubmissionSnapshot; modified: SubmissionSnapshot },
  entityGuid: string,
  latestEvent?: { syncLevel: SyncLevel } | undefined
): SubmissionStatus => {
  // Check if entity has externalId (indicates synced from backend/OpenSPP)
  if (snapshot.modified.data.externalId) {
    return 'synced'
  }

  // Check syncLevel in data (some entities may have this stored)
  const syncLevel =
    (snapshot.modified.data.syncLevel as SyncLevel | undefined) ??
    (snapshot.modified.data.sync_status as SyncLevel | undefined)

  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'synced'
  }

  if (syncLevel === SyncLevel.LOCAL) {
    return 'pending'
  }

  // Check latest event syncLevel if available
  if (latestEvent) {
    if (latestEvent.syncLevel === SyncLevel.REMOTE || latestEvent.syncLevel === SyncLevel.EXTERNAL) {
      return 'synced'
    }
    if (latestEvent.syncLevel === SyncLevel.LOCAL) {
      return 'pending'
    }
  }

  // Check draft status
  if ((snapshot.modified.data.status as string | undefined)?.toLowerCase() === 'draft') {
    return 'draft'
  }

  // Check if entity has pending changes (version mismatch)
  if (snapshot.modified.version !== snapshot.initial.version) {
    return 'pending'
  }

  // Default to synced if no version changes and no LOCAL syncLevel found
  return 'synced'
}

onMounted(async () => {
  const foundDocuments = await database.tenantapps
    .find({
      selector: {
        id: route.params.id
      }
    })
    .exec()
  tenantapp.value = foundDocuments[0]

  entityForm.value = tenantapp.value.entityForms.find(
    (entity) => entity.name === route.params.entity
  )

  // Get all entities and filter client-side to handle entityName mismatches
  // Backend/OpenSPP entities may have different entityName values than form names
  const [allEntities, allEvents] = await Promise.all([
    store.getAllEntities(),
    store.getAllEvents()
  ])
  
  const entityList = allEntities.filter((entity) => {
    const entityName = entity.modified.data.entityName as string | undefined
    const formName = entityForm.value?.name
    
    // Match entities that either:
    // 1. Have matching entityName (exact match)
    // 2. Have entityName that matches form name (case-insensitive)
    // 3. Have no entityName but match parentGuid (for backward compatibility)
    const matchesEntityName = entityName && (
      entityName === formName ||
      entityName.toLowerCase() === formName?.toLowerCase() ||
      // Check if entityName is a substring of form name or vice versa
      (formName && (entityName.includes(formName) || formName.includes(entityName)))
    )
    
    // Check parentGuid filter
    const matchesParent = !entity.modified.data.parentGuid || 
      entity.modified.data.parentGuid === props.parentGuid
    
    // Include if matches entityName OR (no entityName filter but matches parent)
    return (matchesEntityName || (!entityName && matchesParent)) && matchesParent
  })

  // Create a map of entityGuid -> latest event for efficient lookup
  const entityEventsMap = new Map<string, typeof allEvents[0]>()
  for (const event of allEvents) {
    const existing = entityEventsMap.get(event.entityGuid)
    if (!existing || new Date(event.timestamp) > new Date(existing.timestamp)) {
      entityEventsMap.set(event.entityGuid, event)
    }
  }

  // Resolve status for each entity
  submissions.value = entityList.map((entity) => {
    const base = {
      guid: entity.modified.guid,
      initial: {
        lastUpdated: entity.initial.lastUpdated,
        version: entity.initial.version,
        data: entity.initial.data,
        name: entity.initial.name
      },
      modified: {
        lastUpdated: entity.modified.lastUpdated,
        version: entity.modified.version,
        data: entity.modified.data,
        name: entity.modified.name
      }
    }

    return {
      ...base,
      status: resolveStatusSync(base, entity.modified.guid, entityEventsMap.get(entity.modified.guid))
    }
  })
})

const onBack = () => {
  router.go(-1)
}

const statusLabel = (status: SubmissionStatus) => {
  switch (status) {
    case 'synced':
      return 'Synced'
    case 'pending':
      return 'Pending Sync'
    case 'draft':
      return 'Draft'
    default:
      return 'Unknown'
  }
}

const statusIcon = (status: SubmissionStatus) => {
  switch (status) {
    case 'synced':
      return 'check-circle'
    case 'pending':
      return 'cloud-upload'
    case 'draft':
      return 'note'
    default:
      return 'info'
  }
}

const filteredSubmissions = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) {
    return submissions.value
  }
  return submissions.value.filter((submission) => {
    const name = (submission.modified.data.name as string | undefined)?.toLowerCase() || ''
    const description = JSON.stringify(submission.modified.data).toLowerCase()
    return name.includes(term) || description.includes(term)
  })
})

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) {
    return '—'
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString()
}
</script>

<template>
  <div v-if="tenantapp" class="entity-view">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back to forms">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <div class="top-bar__meta">
        <span class="badge">{{ entityForm?.displayTemplate || 'Form' }}</span>
        <span class="breadcrumb">{{ getBreadcrumbFromPath(route.path) }}</span>
      </div>
    </div>

    <header class="entity-header">
      <div>
        <h1>{{ entityForm?.title }}</h1>
        <p>{{ entityForm?.description || 'View saved submissions and continue data collection.' }}</p>
      </div>
      <button
        class="pill-button"
        type="button"
        @click="router.push(route.path + '/new')"
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
        </svg>
      </button>
    </header>

    <section class="submissions-panel" aria-labelledby="submissions-heading">
      <div class="submissions-header">
        <div>
          <h2 id="submissions-heading">Entities</h2>
          <p>{{ filteredSubmissions.length }} total submissions</p>
        </div>
        <div class="search-bar">
          <svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79l5 4.99L20.49 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"
              fill="currentColor"
            />
          </svg>
          <input v-model="searchTerm" type="search" placeholder="Search submissions..." />
        </div>
      </div>

      <ul class="submission-list" role="list">
        <li
          v-for="submission in filteredSubmissions"
          :key="submission.guid"
          class="submission-card"
          @click="router.push(route.path + '/' + submission.guid + '/detail')"
        >
          <div class="submission-body">
            <div class="submission-header">
              <h3>{{ submission.modified.data.name || submission.modified.name || 'Untitled submission' }}</h3>
              <div class="submission-status" :class="`status-${submission.status}`">
                <span class="status-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path
                      v-if="statusIcon(submission.status) === 'check-circle'"
                      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 14-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10z"
                      fill="currentColor"
                    />
                    <path
                      v-else-if="statusIcon(submission.status) === 'cloud-upload'"
                      d="M19.35 10.04A7 7 0 0 0 5 9a5 5 0 0 0 .65 9.95H19a4 4 0 0 0 .35-7.91zM13 13v4h-2v-4H8l4-4 4 4h-3z"
                      fill="currentColor"
                    />
                    <path
                      v-else-if="statusIcon(submission.status) === 'note'"
                      d="M18 2H6a2 2 0 0 0-2 2v16l4-4h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
                      fill="currentColor"
                    />
                    <path
                      v-else
                      d="M11 17h2v2h-2zm0-12h2v10h-2zm1-5C6.48 0 2 4.48 2 10s4.48 10 10 10 10-4.48 10-10S17.52 0 12 0z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>
            </div>
            <p class="submission-meta">Last updated • {{ formatTimestamp(submission.modified.lastUpdated) }}</p>
            <p class="submission-details">Created • {{ formatTimestamp(submission.initial.lastUpdated) }}</p>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M9.29 6.71 13.17 10.59 9.29 14.47 10.71 15.88 16 10.59 10.71 5.29z" fill="currentColor" />
          </svg>
        </li>
        <li v-if="!filteredSubmissions.length" class="empty-state">
          <p>No submissions yet. Start a new entry to begin collecting data.</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.entity-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.top-bar__meta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-end;
}

.breadcrumb {
  font-size: 0.8rem;
  color: #6b7280;
}

.entity-header {
  background: #ffffff;
  border-radius: 16px;
  padding: 1rem 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.entity-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #111827;
}

.entity-header p {
  margin-top: 0.35rem;
  color: #6b7280;
  font-size: 0.95rem;
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

.submissions-panel {
  background: #ffffff;
  border-radius: 16px;
  padding: 1rem 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.submissions-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.submissions-header h2 {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
}

.submissions-header p {
  color: #6b7280;
  font-size: 0.9rem;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #f9fafb;
  border-radius: 14px;
  padding: 0.65rem 1rem;
}

.search-bar input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.95rem;
  color: #1f2937;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #9ca3af;
}

.submission-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
}

.submission-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.875rem 1rem;
  background: #f9fafb;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.submission-card:active {
  transform: scale(0.99);
}

.submission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
}

.submission-status {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.status-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

.status-synced .status-icon {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.status-pending .status-icon {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.status-draft .status-icon {
  background: rgba(234, 179, 8, 0.15);
  color: #b45309;
}

.status-unknown .status-icon {
  background: rgba(148, 163, 184, 0.18);
  color: #475569;
}

.submission-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.submission-body h3 {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.submission-meta {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

.submission-details {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0;
}

.chevron {
  width: 20px;
  height: 20px;
  color: #9ca3af;
}

.empty-state {
  text-align: center;
  padding: 2rem 1.5rem;
  background: #f9fafb;
  border-radius: 18px;
  color: #6b7280;
  font-size: 0.95rem;
}
</style>
