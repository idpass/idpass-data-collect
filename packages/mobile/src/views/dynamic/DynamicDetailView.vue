<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormSubmission, EntityDoc } from '@idpass/data-collect-core'
import { SyncLevel } from '@idpass/data-collect-core'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<Array<{ initial: EntityDoc; modified: EntityDoc }> | undefined>()
const dependentForms = ref<EntityForm[]>([])
const openViewDialog = ref(false)
const events = ref<FormSubmission[]>([])
const { isOffline } = useNetworkStatus()

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
  const entityData = await store.searchEntities([{ guid: route.params.guid }])
  storedEntityData.value = entityData

  dependentForms.value = tenantapp.value.entityForms.filter(
    (entity) => entity.dependsOn === entityForm.value.name
  )

  const allEvents = await store.getAllEvents()
  events.value = allEvents
    .filter((event) => event.entityGuid === route.params.guid)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const onBack = () => {
  router.go(-1)
}

const formatEventType = (type: string) => {
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

const getSyncLabel = (syncLevel: SyncLevel) => {
  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'Synced'
  }
  return 'Local'
}

const getSyncColor = (syncLevel: SyncLevel) => {
  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'success'
  }
  return 'warning'
}

const getEntityName = () => {
  if (!storedEntityData.value || storedEntityData.value.length === 0) {
    return entityForm.value?.title || 'Entity'
  }
  const entity = storedEntityData.value[0]
  const name = entity?.modified?.data?.name || entity?.modified?.name
  return name || entityForm.value?.title || 'Entity'
}
</script>

<template>
  <v-container v-if="tenantapp && storedEntityData" fluid class="pa-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <div class="d-flex align-center ga-2">
        <v-btn icon="mdi-arrow-left" variant="tonal" size="small" @click="onBack" aria-label="Back to submissions" />
        <v-chip v-if="isOffline" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-wifi-off">
          Offline
        </v-chip>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text>
        <div class="d-flex justify-space-between align-start ga-3">
          <div class="flex-grow-1">
            <div class="text-h6 font-weight-bold">{{ getEntityName() }}</div>
            <div class="d-flex align-center ga-2 flex-wrap mt-2">
              <v-chip size="x-small" variant="tonal">
                Updated {{ storedEntityData && storedEntityData[0] ? new Date(storedEntityData[0].modified.lastUpdated).toLocaleString() : '' }}
              </v-chip>
              <v-chip size="x-small" variant="tonal">
                Version {{ storedEntityData && storedEntityData[0] ? storedEntityData[0].modified.version : '' }}
              </v-chip>
            </div>
          </div>
          <div class="d-flex ga-2 flex-shrink-0">
            <v-btn icon="mdi-pencil" color="secondary" variant="flat" size="small" @click="router.push('edit')" aria-label="Edit" />
            <v-btn icon="mdi-eye" variant="tonal" size="small" @click="openViewDialog = true" aria-label="View JSON" />
          </div>
        </div>
      </v-card-text>
    </v-card>

    <template v-if="events.length > 0">
      <div class="text-subtitle-2 font-weight-bold mb-2">Events</div>
      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel v-for="event in events" :key="event.guid">
          <v-expansion-panel-title>
            <div class="d-flex flex-column ga-1 flex-grow-1 mr-2">
              <span class="text-body-2 font-weight-bold">{{ formatEventType(event.type) }}</span>
              <div class="d-flex align-center ga-2">
                <span class="text-caption text-medium-emphasis">{{ formatTimestamp(event.timestamp) }}</span>
                <v-chip size="x-small" :color="getSyncColor(event.syncLevel)" variant="tonal">
                  {{ getSyncLabel(event.syncLevel) }}
                </v-chip>
              </div>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-caption text-medium-emphasis mb-2">by {{ event.userId }}</div>
            <div class="text-overline mb-1">Event Data</div>
            <pre class="json-block mb-3">{{ JSON.stringify(event.data, null, 2) }}</pre>
            <div class="text-overline mb-1">Full Event</div>
            <pre class="json-block">{{ JSON.stringify(event, null, 2) }}</pre>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>

    <template v-if="dependentForms.length > 0">
      <div class="text-subtitle-2 font-weight-bold mb-2">Dependent Forms</div>
      <v-list lines="two" rounded="xl" elevation="1" bg-color="surface">
        <v-list-item
          v-for="form in dependentForms"
          :key="form.name"
          @click="router.push(route.path + '/' + form.name)"
          append-icon="mdi-chevron-right"
        >
          <v-list-item-title class="font-weight-bold">{{ form.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ form.description || 'Capture additional linked information.' }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </template>
  </v-container>

  <v-dialog v-model="openViewDialog" max-width="600" scrollable>
    <v-card rounded="xl">
      <v-card-title class="pa-4">View Entity</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <pre class="json-block">{{ storedEntityData && storedEntityData[0] ? JSON.stringify(storedEntityData[0].modified.data, null, 2) : '' }}</pre>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="openViewDialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.json-block {
  background: #0f172a;
  border-radius: 8px;
  padding: 0.75rem;
  color: #f8fafc;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
