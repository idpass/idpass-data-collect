<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import ViewDialog from '@/components/ViewDialog.vue'
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormSubmission } from '@idpass/data-collect-core'
import { SyncLevel } from '@idpass/data-collect-core'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<unknown>()
const dependentForms = ref<EntityForm[]>([])
const openViewAppDialog = ref(false)
const events = ref<FormSubmission[]>([])
const expandedEvents = ref<Set<string>>(new Set())

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

  // Load events for this entity
  const allEvents = await store.getAllEvents()
  events.value = allEvents
    .filter((event) => event.entityGuid === route.params.guid)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
})

const onBack = () => {
  router.go(-1)
}

const onView = () => {
  openViewAppDialog.value = true
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

const getSyncClass = (syncLevel: SyncLevel) => {
  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'synced'
  }
  return 'local'
}

const toggleEvent = (eventGuid: string) => {
  if (expandedEvents.value.has(eventGuid)) {
    expandedEvents.value.delete(eventGuid)
  } else {
    expandedEvents.value.add(eventGuid)
  }
}

const isExpanded = (eventGuid: string) => {
  return expandedEvents.value.has(eventGuid)
}

const getEntityName = () => {
  if (!storedEntityData.value || !Array.isArray(storedEntityData.value) || storedEntityData.value.length === 0) {
    return entityForm.value?.title || 'Entity'
  }
  const entity = (storedEntityData.value as any)[0]
  const name = entity?.modified?.data?.name || entity?.modified?.name
  return name || entityForm.value?.title || 'Entity'
}
</script>

<template>
  <div v-if="tenantapp && storedEntityData" class="detail-view">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back to submissions">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <span class="breadcrumb">{{ getBreadcrumbFromPath(route.path) }}</span>
    </div>

    <section class="detail-hero">
      <header class="detail-hero__header">
        <div class="header-content">
          <h1>{{ getEntityName() }}</h1>
          <div class="header-meta">
            <span class="meta-inline">
              Updated {{ new Date((storedEntityData as any)[0].modified.lastUpdated).toLocaleString() }}
            </span>
            <span class="meta-separator">•</span>
            <span class="meta-inline">Version {{ (storedEntityData as any)[0].modified.version }}</span>
          </div>
        </div>
        <div class="action-group">
          <button class="action-button" type="button" @click="router.push('edit')" aria-label="Edit">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
            </svg>
          </button>
          <button class="action-button" type="button" @click="onView" aria-label="View JSON">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>
    </section>

    <section v-if="events.length > 0" class="events-section" aria-labelledby="events-heading">
      <h2 id="events-heading">Events</h2>
      <ul role="list" class="events-list">
        <li v-for="event in events" :key="event.guid" class="event-card">
          <div class="event-content" @click="toggleEvent(event.guid)">
            <div class="event-header">
              <div class="event-title-group">
                <span class="event-type">{{ formatEventType(event.type) }}</span>
                <span class="event-time">{{ formatTimestamp(event.timestamp) }}</span>
              </div>
              <button class="expand-button" type="button" :aria-expanded="isExpanded(event.guid)" aria-label="Toggle event details" @click.stop="toggleEvent(event.guid)">
                <svg 
                  class="expand-icon" 
                  :class="{ 'expanded': isExpanded(event.guid) }"
                  viewBox="0 0 24 24" 
                  focusable="false"
                >
                  <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" fill="currentColor" />
                </svg>
              </button>
            </div>
            <div class="event-meta">
              <span class="event-user">by {{ event.userId }}</span>
              <span class="event-sync" :class="`event-sync--${getSyncClass(event.syncLevel)}`">
                {{ getSyncLabel(event.syncLevel) }}
              </span>
            </div>
          </div>
          <div v-if="isExpanded(event.guid)" class="event-details">
            <div class="event-details-section">
              <h4>Event Data</h4>
              <div class="json-viewer-compact">
                <pre class="json-block-compact">{{ JSON.stringify(event.data, null, 2) }}</pre>
              </div>
            </div>
            <div class="event-details-section">
              <h4>Full Event</h4>
              <div class="json-viewer-compact">
                <pre class="json-block-compact">{{ JSON.stringify(event, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="dependentForms.length > 0" class="dependent-section" aria-labelledby="dependent-heading">
      <h2 id="dependent-heading">Dependent Forms</h2>
      <ul role="list" class="dependent-list">
        <li v-for="form in dependentForms" :key="form.name" class="dependent-card" @click="router.push(route.path + '/' + form.name)">
          <div>
            <h3>{{ form.title }}</h3>
            <p>{{ form.description || 'Capture additional linked information.' }}</p>
          </div>
          <ChevronRight />
        </li>
      </ul>
    </section>
  </div>

  <ViewDialog
    :open="openViewAppDialog"
    title="View Entity"
    @update:open="openViewAppDialog = $event"
  >
    <template #form-content>
      <div class="json-viewer">
        <pre class="json-block">{{ (storedEntityData as any)[0].modified.data }}</pre>
      </div>
    </template>
  </ViewDialog>
</template>

<style scoped>
.detail-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.icon-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  display: grid;
  place-items: center;
  color: #1f2937;
}

.breadcrumb {
  font-size: 0.8rem;
  color: #6b7280;
}

.detail-hero {
  background: #ffffff;
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.detail-hero__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.header-content {
  flex: 1;
}

.detail-hero__header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.meta-inline {
  font-size: 0.85rem;
  color: #6b7280;
}

.meta-separator {
  color: #d1d5db;
  font-size: 0.85rem;
}

.action-group {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.action-button {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  display: grid;
  place-items: center;
  color: #1f2937;
  cursor: pointer;
  transition: background 0.2s ease;
}

.action-button:first-child {
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
}

.action-button:hover {
  background: rgba(15, 23, 42, 0.12);
}

.action-button:first-child:hover {
  opacity: 0.9;
}

.action-button svg {
  width: 18px;
  height: 18px;
}

.events-section {
  background: #ffffff;
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.events-section h2 {
  font-size: 1rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 0.75rem 0;
}

.events-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-card {
  background: #f9fafb;
  border-radius: 12px;
  padding: 0;
  border-left: 3px solid #2563eb;
  overflow: hidden;
}

.event-content {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.event-content:active {
  background: rgba(15, 23, 42, 0.05);
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.event-title-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.expand-button {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: #6b7280;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.expand-icon {
  width: 20px;
  height: 20px;
  transition: transform 0.2s ease;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.event-type {
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
}

.event-time {
  font-size: 0.8rem;
  color: #6b7280;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.event-user {
  font-size: 0.8rem;
  color: #6b7280;
}

.event-sync {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 8px;
  font-weight: 500;
}

.event-sync--synced {
  background: #dcfce7;
  color: #166534;
}

.event-sync--local {
  background: #fef3c7;
  color: #92400e;
}

.event-details {
  border-top: 1px solid #e5e7eb;
  padding: 0.75rem;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-details-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-details-section h4 {
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.json-viewer-compact {
  background: #0f172a;
  border-radius: 8px;
  padding: 0.75rem;
  color: #f8fafc;
  max-height: 300px;
  overflow-y: auto;
}

.json-block-compact {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.dependent-section {
  background: #ffffff;
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.dependent-section h2 {
  font-size: 1rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 0.75rem 0;
}

.dependent-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dependent-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: #f9fafb;
  border-radius: 12px;
  padding: 0.75rem;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.dependent-card:active {
  transform: scale(0.99);
}

.dependent-card h3 {
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
}

.dependent-card p {
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.85rem;
}

.json-viewer {
  background: #0f172a;
  border-radius: 16px;
  padding: 1rem;
  color: #f8fafc;
  max-height: 70vh;
  overflow-y: auto;
}

.json-block {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
}
</style>
