<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { SyncLevel } from '@idpass/data-collect-core'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

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
const { isOffline } = useNetworkStatus()

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
  if (snapshot.modified.data.externalId) {
    return 'synced'
  }

  const syncLevel =
    (snapshot.modified.data.syncLevel as SyncLevel | undefined) ??
    (snapshot.modified.data.sync_status as SyncLevel | undefined)

  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'synced'
  }

  if (syncLevel === SyncLevel.LOCAL) {
    return 'pending'
  }

  if (latestEvent) {
    if (latestEvent.syncLevel === SyncLevel.REMOTE || latestEvent.syncLevel === SyncLevel.EXTERNAL) {
      return 'synced'
    }
    if (latestEvent.syncLevel === SyncLevel.LOCAL) {
      return 'pending'
    }
  }

  if ((snapshot.modified.data.status as string | undefined)?.toLowerCase() === 'draft') {
    return 'draft'
  }

  if (snapshot.modified.version !== snapshot.initial.version) {
    return 'pending'
  }

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

  const [allEntities, allEvents] = await Promise.all([
    store.getAllEntities(),
    store.getAllEvents()
  ])

  const entityList = allEntities.filter((entity) => {
    const entityName = entity.modified.data.entityName as string | undefined
    const formName = entityForm.value?.name

    const matchesEntityName = entityName && (
      entityName === formName ||
      entityName.toLowerCase() === formName?.toLowerCase() ||
      (formName && (entityName.includes(formName) || formName.includes(entityName)))
    )

    const matchesParent = !entity.modified.data.parentGuid ||
      entity.modified.data.parentGuid === props.parentGuid

    return (matchesEntityName || (!entityName && matchesParent)) && matchesParent
  })

  const entityEventsMap = new Map<string, typeof allEvents[0]>()
  for (const event of allEvents) {
    const existing = entityEventsMap.get(event.entityGuid)
    if (!existing || new Date(event.timestamp) > new Date(existing.timestamp)) {
      entityEventsMap.set(event.entityGuid, event)
    }
  }

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

const statusConfig = (status: SubmissionStatus) => {
  switch (status) {
    case 'synced': return { label: 'Synced', color: 'success', icon: 'mdi-check-circle' }
    case 'pending': return { label: 'Pending Sync', color: 'info', icon: 'mdi-cloud-upload' }
    case 'draft': return { label: 'Draft', color: 'warning', icon: 'mdi-note-outline' }
    default: return { label: 'Unknown', color: 'default', icon: 'mdi-help-circle' }
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
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}
</script>

<template>
  <v-container v-if="tenantapp" fluid class="pa-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="tonal" size="small" @click="onBack" aria-label="Back to forms" />
      <div class="d-flex align-center ga-2">
        <v-chip size="small" color="info" variant="tonal">{{ entityForm?.displayTemplate || 'Form' }}</v-chip>
        <v-chip v-if="isOffline" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-wifi-off">
          Offline
        </v-chip>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text class="d-flex justify-space-between align-start ga-3">
        <div>
          <div class="text-h6 font-weight-bold">{{ entityForm?.title }}</div>
          <p class="text-body-2 text-medium-emphasis mt-1">
            {{ entityForm?.description || 'View saved submissions and continue data collection.' }}
          </p>
        </div>
        <v-btn
          icon="mdi-plus"
          color="secondary"
          variant="flat"
          size="small"
          @click="router.push(route.path + '/new')"
          aria-label="New entry"
        />
      </v-card-text>
    </v-card>

    <v-text-field
      v-model="searchTerm"
      prepend-inner-icon="mdi-magnify"
      placeholder="Search by name..."
      variant="solo-filled"
      flat
      density="compact"
      hide-details
      clearable
      rounded="pill"
      single-line
      class="mb-3"
    />

    <div class="text-caption text-medium-emphasis mb-2">
      {{ filteredSubmissions.length }} entities {{ filteredSubmissions.length === submissions.length ? 'total' : 'found' }}
    </div>

    <v-list v-if="filteredSubmissions.length" lines="three" rounded="lg" elevation="1" bg-color="surface">
      <v-list-item
        v-for="submission in filteredSubmissions"
        :key="submission.guid"
        @click="router.push(route.path + '/' + submission.guid + '/detail')"
      >
        <v-list-item-title class="font-weight-bold">
          {{ submission.modified.data.name || submission.modified.name || 'Untitled submission' }}
        </v-list-item-title>
        <v-list-item-subtitle>
          Last updated {{ formatTimestamp(submission.modified.lastUpdated) }}
        </v-list-item-subtitle>
        <template #prepend>
          <v-icon :icon="statusConfig(submission.status).icon" :color="statusConfig(submission.status).color" class="mr-3" />
        </template>
        <template #append>
          <div class="d-flex align-center ga-2">
            <v-chip size="x-small" :color="statusConfig(submission.status).color" variant="tonal">
              {{ statusConfig(submission.status).label }}
            </v-chip>
            <v-icon icon="mdi-chevron-right" size="small" color="medium-emphasis" />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-empty-state
      v-else
      icon="mdi-inbox-outline"
      title="No records yet"
      text="Start a new entry to begin collecting data."
    />
  </v-container>
</template>

