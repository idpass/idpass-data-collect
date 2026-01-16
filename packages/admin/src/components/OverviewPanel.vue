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

interface Props {
  totalPrograms: number
  totalEntities: number
  syncEnabledCount: number
  localOnlyCount: number
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const serverStatus = computed(() => {
  return {
    label: 'Connected',
    color: 'success',
    icon: 'mdi-check-circle',
  }
})

const stats = computed(() => [
  {
    label: 'Total Programs',
    value: props.totalPrograms,
    icon: 'mdi-view-dashboard-outline',
    color: 'primary',
  },
  {
    label: 'Total Entities',
    value: props.totalEntities,
    icon: 'mdi-database-outline',
    color: 'secondary',
  },
  {
    label: 'Sync Enabled',
    value: props.syncEnabledCount,
    icon: 'mdi-sync-circle',
    color: 'success',
  },
  {
    label: 'Local Only',
    value: props.localOnlyCount,
    icon: 'mdi-lan-disconnect',
    color: 'grey',
  },
])
</script>

<template>
  <v-card class="overview-panel" border="md" elevation="0">
    <v-card-text>
      <div class="overview-panel__header">
        <h2 class="overview-panel__title">Overview</h2>
        <v-chip :color="serverStatus.color" variant="tonal" size="small" density="comfortable">
          <v-icon :icon="serverStatus.icon" size="14" start />
          {{ serverStatus.label }}
        </v-chip>
      </div>

      <v-progress-linear v-if="isLoading" class="mt-4" color="primary" indeterminate />

      <div v-else class="overview-panel__stats">
        <div v-for="stat in stats" :key="stat.label" class="overview-panel__stat">
          <div class="overview-panel__stat-icon" :class="`stat-icon--${stat.color}`">
            <v-icon :icon="stat.icon" size="20" />
          </div>
          <div class="overview-panel__stat-content">
            <p class="overview-panel__stat-value">{{ stat.value }}</p>
            <p class="overview-panel__stat-label">{{ stat.label }}</p>
          </div>
        </div>
      </div>

      <v-divider class="my-4" />

      <div class="overview-panel__info">
        <div class="overview-panel__info-row">
          <span class="overview-panel__info-label">Server Status</span>
          <v-chip :color="serverStatus.color" size="x-small" variant="flat">
            {{ serverStatus.label }}
          </v-chip>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.overview-panel {
  border-radius: 16px;
}

.overview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.overview-panel__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.overview-panel__stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.overview-panel__stat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.overview-panel__stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon--primary {
  background: rgba(33, 150, 243, 0.12);
  color: rgb(25, 118, 210);
}

.stat-icon--secondary {
  background: rgba(103, 58, 183, 0.12);
  color: rgb(81, 45, 168);
}

.stat-icon--success {
  background: rgba(76, 175, 80, 0.12);
  color: rgb(56, 142, 60);
}

.stat-icon--grey {
  background: rgba(96, 125, 139, 0.12);
  color: rgb(69, 90, 100);
}

.overview-panel__stat-content {
  min-width: 0;
}

.overview-panel__stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}

.overview-panel__stat-label {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.overview-panel__info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overview-panel__info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.overview-panel__info-label {
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.6);
}

@media (max-width: 1280px) {
  .overview-panel__stats {
    grid-template-columns: 1fr;
  }
}
</style>
