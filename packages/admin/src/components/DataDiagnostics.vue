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
import { ref, computed } from 'vue'
import { getEntities, getEntitiesCountByForm } from '@/api'

interface Props {
  configId: string
}

const props = defineProps<Props>()

const isExpanded = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const entityData = ref<unknown>(null)
const entityCounts = ref<Record<string, number>>({})

const entityCount = computed(() => {
  if (Array.isArray(entityData.value)) {
    return (entityData.value as unknown[]).length
  }
  return 0
})

const loadData = async () => {
  isLoading.value = true
  error.value = null
  try {
    const [entities, counts] = await Promise.all([
      getEntities(props.configId),
      getEntitiesCountByForm(props.configId)
    ])
    entityData.value = entities
    entityCounts.value = counts
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load data'
    console.error('Data diagnostics error:', err)
  } finally {
    isLoading.value = false
  }
}

const toggleExpanded = () => {
  if (!isExpanded.value) {
    loadData()
  }
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="data-diagnostics">
    <button class="diagnostics-toggle" @click="toggleExpanded" type="button">
      <span v-if="isExpanded">▼</span>
      <span v-else>▶</span>
      Data Diagnostics
      <span v-if="entityCount > 0" class="badge">{{ entityCount }} entities</span>
    </button>

    <div v-if="isExpanded" class="diagnostics-panel">
      <div v-if="isLoading" class="loading">
        <p>Loading data...</p>
      </div>

      <div v-else-if="error" class="error">
        <p><strong>Error:</strong> {{ error }}</p>
      </div>

      <div v-else class="diagnostics-content">
        <div class="diagnostics-section">
          <h4>Entity Counts by Form</h4>
          <div v-if="Object.keys(entityCounts).length === 0" class="info">
            No entity counts data
          </div>
          <div v-else class="counts-table">
            <div v-for="(count, form) in entityCounts" :key="form" class="count-row">
              <span class="form-name">{{ form }}</span>
              <span class="count-value">{{ count }}</span>
            </div>
          </div>
        </div>

        <div class="diagnostics-section">
          <h4>Raw Entity Data ({{ entityCount }} records)</h4>
          <div v-if="!entityData || (Array.isArray(entityData) && entityData.length === 0)" class="info">
            No entity records found
          </div>
          <pre v-else class="json-display">{{ JSON.stringify(entityData, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-diagnostics {
  margin-top: 1rem;
  border-top: 2px solid #e5e7eb;
  padding-top: 1rem;
}

.diagnostics-toggle {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  transition: background 0.2s;
}

.diagnostics-toggle:hover {
  background: #e5e7eb;
}

.diagnostics-toggle span:first-child {
  display: inline-block;
  width: 16px;
}

.badge {
  background: #3b82f6;
  color: white;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  margin-left: auto;
}

.diagnostics-panel {
  margin-top: 1rem;
  background: #f9fafb;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #e5e7eb;
}

.loading,
.error,
.info {
  padding: 1rem;
  border-radius: 6px;
  text-align: center;
}

.loading {
  background: #dbeafe;
  color: #1e40af;
}

.error {
  background: #fee2e2;
  color: #991b1b;
}

.info {
  background: #f0fdf4;
  color: #166534;
}

.diagnostics-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.diagnostics-section h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #374151;
}

.counts-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: white;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.count-row {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.count-row:last-child {
  border-bottom: none;
}

.form-name {
  font-weight: 500;
  color: #1f2937;
}

.count-value {
  background: #3b82f6;
  color: white;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-weight: 600;
  font-size: 0.85rem;
}

.json-display {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #374151;
  max-height: 400px;
  overflow-y: auto;
}
</style>
