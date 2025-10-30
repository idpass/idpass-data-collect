<!--
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
-->

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AxiosError } from 'axios'
import { getEntities, getEntityEvents } from '@/api'
import type { EntityRecord, EventRecord } from '@/api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const isLoading = ref(true)
const error = ref<string | null>(null)
const entity = ref<EntityRecord | null>(null)
const events = ref<EventRecord[]>([])
const expandedEventIndices = ref<Set<number>>(new Set())

const routeId = computed(() => route.params.id as string)
const entityGuid = computed(() => route.params.guid as string)

const formatDate = (dateString: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

const getEventTypeColor = (type: string): string => {
  if (type.startsWith('create-')) return 'success'
  if (type.startsWith('update-')) return 'info'
  if (type.startsWith('delete-')) return 'error'
  return 'grey'
}

const getEventTypeIcon = (type: string): string => {
  if (type.startsWith('create-')) return 'mdi-plus-circle'
  if (type.startsWith('update-')) return 'mdi-pencil-circle'
  if (type.startsWith('delete-')) return 'mdi-delete-circle'
  return 'mdi-circle'
}

const toggleEventExpanded = (index: number) => {
  if (expandedEventIndices.value.has(index)) {
    expandedEventIndices.value.delete(index)
  } else {
    expandedEventIndices.value.add(index)
  }
}

const fetchEntityAndEvents = async () => {
  if (!routeId.value || !entityGuid.value) {
    error.value = 'Missing collection program or entity ID'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // Fetch all entities to find the one we need
    const allEntities = await getEntities(routeId.value, 1000)
    const foundEntity = allEntities.find((e) => e.guid === entityGuid.value)

    if (!foundEntity) {
      error.value = 'Entity not found'
      return
    }

    entity.value = foundEntity

    // Fetch events for this entity
    const entityEvents = await getEntityEvents(entityGuid.value, routeId.value)
    events.value = entityEvents
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 401) {
      authStore.logout()
      return
    }
    console.error('Failed to load entity details', err)
    error.value = err instanceof Error ? err.message : 'Failed to load entity details.'
  } finally {
    isLoading.value = false
  }
}

const goBack = () => {
  router.push({ name: 'app-details', params: { id: routeId.value } })
}

onMounted(() => {
  fetchEntityAndEvents()
})
</script>

<template>
  <v-container class="entity-detail" fluid>
    <v-btn class="detail-back" variant="text" prepend-icon="mdi-arrow-left" @click="goBack">
      Back to Collection Program
    </v-btn>

    <v-skeleton-loader v-if="isLoading" class="mt-6" type="card" />

    <v-alert v-else-if="error" class="mt-6" type="error" border="start" variant="tonal">
      {{ error }}
    </v-alert>

    <template v-else-if="entity">
      <div class="detail-header">
        <div class="detail-header__text">
          <h1 class="detail-header__title">{{ entity.name || 'Unnamed Entity' }}</h1>
          <p class="detail-header__subtitle">{{ entity.entityName }}</p>
        </div>
        <v-chip :color="entity.type === 'individual' ? 'primary' : 'secondary'" variant="tonal">
          {{ entity.type }}
        </v-chip>
      </div>

      <v-row class="mt-6" dense>
        <v-col cols="12" lg="8">
          <v-card class="detail-content" border="md" elevation="0">
            <!-- Entity Information Section -->
            <v-card-text class="pa-6">
              <h2 class="section-title mb-4">Entity Information</h2>
              <div class="entity-info-grid">
                <div class="info-item">
                  <span class="info-label">GUID</span>
                  <span class="info-value" :title="entity.guid">
                    {{ entity.guid.substring(0, 16) }}...
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">Entity ID</span>
                  <span class="info-value">{{ entity.id }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Type</span>
                  <span class="info-value">{{ entity.type }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Last Updated</span>
                  <span class="info-value">{{ formatDate(entity.lastUpdated) }}</span>
                </div>
              </div>

              <v-divider class="my-6" />

              <h2 class="section-title mb-4">Entity Data</h2>
              <v-sheet class="data-sheet pa-4" color="surface-variant">
                <pre class="data-display">{{ JSON.stringify(entity.data, null, 2) }}</pre>
              </v-sheet>
            </v-card-text>
          </v-card>

          <!-- Events Section -->
          <v-card class="detail-content mt-6" border="md" elevation="0">
            <v-card-text class="pa-6">
              <h2 class="section-title mb-4">
                Event History
                <v-chip size="small" variant="tonal" color="primary" class="ml-2">
                  {{ events.length }} events
                </v-chip>
              </h2>

              <div v-if="events.length === 0" class="empty-state">
                No events found for this entity.
              </div>

              <div v-else class="events-timeline">
                <div
                  v-for="(event, index) in events"
                  :key="`event-${index}`"
                  class="timeline-item"
                >
                  <div class="timeline-marker" :class="`marker-${getEventTypeColor(event.type)}`">
                    <v-icon :icon="getEventTypeIcon(event.type)" size="18" />
                  </div>
                  <div class="timeline-content">
                    <div class="event-header">
                      <div class="event-header-left">
                        <v-chip
                          :color="getEventTypeColor(event.type)"
                          size="small"
                          variant="tonal"
                          :prepend-icon="getEventTypeIcon(event.type)"
                        >
                          {{ event.type }}
                        </v-chip>
                        <span class="event-timestamp">{{ formatDate(event.timestamp) }}</span>
                      </div>
                      <v-btn
                        icon
                        size="small"
                        variant="text"
                        @click="toggleEventExpanded(index)"
                      >
                        <v-icon :icon="expandedEventIndices.has(index) ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
                      </v-btn>
                    </div>

                    <div v-if="expandedEventIndices.has(index)" class="event-details mt-3">
                      <div class="detail-row">
                        <span class="detail-label">Event GUID:</span>
                        <span class="detail-value" :title="event.guid">{{ event.guid.substring(0, 16) }}...</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">User:</span>
                        <span class="detail-value">{{ event.userId }}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Sync Level:</span>
                        <span class="detail-value">{{ event.syncLevel }}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Data:</span>
                      </div>
                      <v-sheet class="data-sheet pa-3 ml-4 mt-2" color="surface-variant">
                        <pre class="data-display">{{ JSON.stringify(event.data, null, 2) }}</pre>
                      </v-sheet>
                    </div>
                  </div>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" lg="4">
          <v-card class="overview-card" border="md" elevation="0">
            <v-card-text>
              <h2 class="overview-card__title mb-4">Details</h2>
              <div class="overview-card__stats">
                <div class="stat-item">
                  <span class="stat-label">Events</span>
                  <span class="stat-value">{{ events.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Type</span>
                  <span class="stat-value">{{ entity.type }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Form</span>
                  <span class="stat-value">{{ entity.entityName }}</span>
                </div>
              </div>

              <v-divider class="my-4" />

              <div class="info-section">
                <h3 class="info-section__title">GUID</h3>
                <p class="info-section__value mono-text">{{ entity.guid }}</p>
              </div>

              <div class="info-section">
                <h3 class="info-section__title">ID</h3>
                <p class="info-section__value mono-text">{{ entity.id }}</p>
              </div>

              <div class="info-section">
                <h3 class="info-section__title">Last Updated</h3>
                <p class="info-section__value">{{ formatDate(entity.lastUpdated) }}</p>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<style scoped>
.entity-detail {
  padding-bottom: 64px;
}

.detail-back {
  margin-top: 8px;
  padding-left: 0;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.detail-header__text {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-header__title {
  font-size: clamp(1.75rem, 1.6rem + 0.5vw, 2.2rem);
  font-weight: 600;
  margin: 0;
}

.detail-header__subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(0, 0, 0, 0.6);
}

.detail-content {
  border-radius: 20px;
  overflow: hidden;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
}

.entity-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 600;
}

.info-value {
  font-size: 0.95rem;
  color: rgba(0, 0, 0, 0.8);
  word-break: break-word;
  font-weight: 500;
}

.data-sheet {
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.02);
}

.data-display {
  margin: 0;
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  line-height: 1.5;
  overflow-x: auto;
}

.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: rgba(0, 0, 0, 0.6);
}

.events-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

.events-timeline::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 40px;
  bottom: 0;
  width: 2px;
  background: rgba(0, 0, 0, 0.1);
}

.timeline-item {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  position: relative;
}

.timeline-marker {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4px;
  position: relative;
  z-index: 1;
}

.marker-success {
  border-color: rgb(76, 175, 80);
  color: rgb(76, 175, 80);
}

.marker-info {
  border-color: rgb(33, 150, 243);
  color: rgb(33, 150, 243);
}

.marker-error {
  border-color: rgb(244, 67, 54);
  color: rgb(244, 67, 54);
}

.marker-grey {
  border-color: rgb(158, 158, 158);
  color: rgb(158, 158, 158);
}

.timeline-content {
  flex: 1;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.event-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.event-timestamp {
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}

.event-details {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-top: 12px;
}

.detail-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.detail-label {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.7);
  min-width: 80px;
}

.detail-value {
  color: rgba(0, 0, 0, 0.8);
  word-break: break-word;
}

.mono-text {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.85rem;
}

.overview-card {
  border-radius: 20px;
  position: sticky;
  top: 20px;
}

.overview-card__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.overview-card__stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.stat-label {
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.6);
}

.stat-value {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.8);
}

.info-section {
  margin-top: 16px;
}

.info-section__title {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.5);
  font-weight: 600;
  margin: 0 0 4px;
}

.info-section__value {
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.8);
  margin: 0;
  word-break: break-all;
}

@media (max-width: 960px) {
  .detail-header {
    align-items: center;
  }

  .entity-info-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .entity-info-grid {
    grid-template-columns: 1fr;
  }

  .event-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .event-header-left {
    width: 100%;
  }
}
</style>
