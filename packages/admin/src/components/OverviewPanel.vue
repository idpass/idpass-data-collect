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
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.overview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.overview-panel__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.overview-panel__stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
}

.overview-panel__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.overview-panel__stat-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-lg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon--primary {
  background: var(--brand-100);
  color: var(--brand-dark);
}

.stat-icon--secondary {
  background: rgba(44, 62, 80, 0.12);
  color: var(--primary);
}

.stat-icon--success {
  background: var(--status-success-light);
  color: var(--status-success);
}

.stat-icon--grey {
  background: var(--neutral-100);
  color: var(--neutral-400);
}

.overview-panel__stat-content {
  min-width: 0;
}

.overview-panel__stat-value {
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0;
  line-height: var(--line-height-tight);
  color: var(--text-main);
}

.overview-panel__stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.overview-panel__info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.overview-panel__info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.overview-panel__info-label {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

@media (max-width: 1280px) {
  .overview-panel__stats {
    grid-template-columns: 1fr;
  }
}
</style>
