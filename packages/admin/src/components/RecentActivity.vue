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
import { computed } from 'vue'

export interface ActivityItem {
  id: string
  programId: string
  programName: string
  type: 'entity_created' | 'entity_updated' | 'sync_completed' | 'program_created'
  description: string
  timestamp: string
}

interface Props {
  activities: ActivityItem[]
  isLoading?: boolean
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxItems: 10,
})

const emit = defineEmits<{
  (e: 'activity-click', activity: ActivityItem): void
}>()

const displayActivities = computed(() => {
  return props.activities.slice(0, props.maxItems)
})

const getActivityIcon = (type: ActivityItem['type']): string => {
  switch (type) {
    case 'entity_created':
      return 'mdi-plus-circle-outline'
    case 'entity_updated':
      return 'mdi-pencil-circle-outline'
    case 'sync_completed':
      return 'mdi-sync'
    case 'program_created':
      return 'mdi-folder-plus-outline'
    default:
      return 'mdi-circle-outline'
  }
}

const getActivityColor = (type: ActivityItem['type']): string => {
  switch (type) {
    case 'entity_created':
      return 'success'
    case 'entity_updated':
      return 'info'
    case 'sync_completed':
      return 'primary'
    case 'program_created':
      return 'secondary'
    default:
      return 'grey'
  }
}

const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return timestamp
  }
}

const handleActivityClick = (activity: ActivityItem) => {
  emit('activity-click', activity)
}
</script>

<template>
  <v-card class="recent-activity" border="md" elevation="0">
    <v-card-text>
      <div class="recent-activity__header">
        <h2 class="recent-activity__title">Recent Activity</h2>
        <v-chip size="x-small" variant="tonal" color="primary">
          {{ displayActivities.length }}
        </v-chip>
      </div>

      <v-progress-linear v-if="isLoading" class="mt-4" color="primary" indeterminate />

      <div v-else-if="displayActivities.length === 0" class="recent-activity__empty">
        <v-icon icon="mdi-history" size="32" color="grey-lighten-1" />
        <p>No recent activity</p>
      </div>

      <div v-else class="recent-activity__list">
        <div
          v-for="activity in displayActivities"
          :key="activity.id"
          class="activity-item"
          @click="handleActivityClick(activity)"
        >
          <div
            class="activity-item__icon"
            :class="`activity-icon--${getActivityColor(activity.type)}`"
          >
            <v-icon :icon="getActivityIcon(activity.type)" size="16" />
          </div>
          <div class="activity-item__content">
            <p class="activity-item__description">{{ activity.description }}</p>
            <p class="activity-item__meta">
              <span class="activity-item__program">{{ activity.programName }}</span>
              <span class="activity-item__time">{{ formatTimestamp(activity.timestamp) }}</span>
            </p>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.recent-activity {
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.recent-activity__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.recent-activity__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.recent-activity__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg) var(--spacing-md);
  color: var(--text-muted);
  gap: var(--spacing-sm);
}

.recent-activity__empty p {
  margin: 0;
  font-size: var(--font-size-sm);
}

.recent-activity__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.activity-item:hover {
  background-color: var(--neutral-50);
}

.activity-item__icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.activity-icon--success {
  background: var(--status-success-light);
  color: var(--status-success);
}

.activity-icon--info {
  background: var(--status-info-light);
  color: var(--status-info);
}

.activity-icon--primary {
  background: var(--brand-100);
  color: var(--brand-dark);
}

.activity-icon--secondary {
  background: rgba(44, 62, 80, 0.12);
  color: var(--primary);
}

.activity-icon--grey {
  background: var(--neutral-100);
  color: var(--neutral-400);
}

.activity-item__content {
  flex: 1;
  min-width: 0;
}

.activity-item__description {
  font-size: var(--font-size-sm);
  margin: 0;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-xs) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.activity-item__program {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.activity-item__time {
  flex-shrink: 0;
}

.activity-item__time::before {
  content: '\2022';
  margin-right: var(--spacing-sm);
}
</style>
