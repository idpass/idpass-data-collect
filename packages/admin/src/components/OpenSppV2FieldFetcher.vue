<!--
  Licensed to the Association pour la cooperation numerique (ACN) under one
  or more contributor license agreements. See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership. The ACN licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License. You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import { fetchOpenSppV2Fields } from '@/api/opensppV2'

const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const isFetching = ref(false)
const fetchError = ref<string | null>(null)
const lastFetchTime = ref<Date | null>(null)

// Check if we have the required configuration
const hasRequiredConfig = computed(() => {
  const config = draftStore.draft.externalSync?.adapterConfig
  const url = draftStore.draft.externalSync?.url
  return !!(url && config?.clientId && config?.clientSecret)
})

// Get fields from the store
const fields = computed(() => draftStore.draft.opensppV2Fields || [])

// Group fields by target type
const individualFields = computed(() =>
  fields.value.filter((f) => f.targetType === 'individual' || f.targetType === 'both')
)

const groupFields = computed(() =>
  fields.value.filter((f) => f.targetType === 'group' || f.targetType === 'both')
)

// Count fields by source
const coreFieldCount = computed(() => fields.value.filter((f) => f.source === 'core').length)
const studioFieldCount = computed(() => fields.value.filter((f) => f.source === 'studio').length)

// Fetch fields from the API
const fetchFields = async () => {
  if (!hasRequiredConfig.value) {
    snackBarStore.showSnackbar('Missing required configuration', 'warning')
    return
  }

  isFetching.value = true
  fetchError.value = null

  try {
    const url = draftStore.draft.externalSync?.url
    const config = draftStore.draft.externalSync?.adapterConfig

    if (!url || !config?.clientId || !config?.clientSecret) {
      throw new Error('Missing required configuration')
    }

    const result = await fetchOpenSppV2Fields({
      baseUrl: url,
      clientId: config.clientId as string,
      clientSecret: config.clientSecret as string,
    })

    if (result.error) {
      fetchError.value = result.error
      snackBarStore.showSnackbar(result.error, 'error')
    } else {
      // Store fields in the draft store
      draftStore.setOpenSppV2Fields(result.fields)
      lastFetchTime.value = new Date()
      snackBarStore.showSnackbar(`Loaded ${result.fields.length} fields from OpenSPP V2`, 'success')
    }
  } catch (error) {
    fetchError.value = error instanceof Error ? error.message : 'Failed to fetch fields'
    snackBarStore.showSnackbar(fetchError.value, 'error')
  } finally {
    isFetching.value = false
  }
}

// Clear fields
const clearFields = () => {
  draftStore.setOpenSppV2Fields([])
  lastFetchTime.value = null
  fetchError.value = null
}

// Auto-fetch when configuration changes (debounced)
const fetchTimeout: ReturnType<typeof setTimeout> | null = null

watch(
  () => ({
    url: draftStore.draft.externalSync?.url,
    clientId: draftStore.draft.externalSync?.adapterConfig?.clientId,
    clientSecret: draftStore.draft.externalSync?.adapterConfig?.clientSecret,
  }),
  () => {
    // Clear any pending fetch
    if (fetchTimeout) {
      clearTimeout(fetchTimeout)
    }
  },
  { deep: true }
)

// Get field type display name
const getFieldTypeDisplay = (type: string): string => {
  const typeMap: Record<string, string> = {
    string: 'Text',
    date: 'Date',
    boolean: 'Boolean',
    integer: 'Integer',
    decimal: 'Decimal',
    selection: 'Selection',
    'codeable-concept': 'Coded Value',
    base64: 'Binary',
  }
  return typeMap[type] || type
}

// Get field source badge color
const getSourceColor = (source: string): string => {
  return source === 'core' ? 'primary' : 'secondary'
}
</script>

<template>
  <div class="v2-field-fetcher">
    <!-- Header -->
    <div class="fetcher-header">
      <div class="fetcher-header__info">
        <h4 class="fetcher-title">OpenSPP V2 Fields</h4>
        <p class="fetcher-description">
          Fetch available fields directly from the OpenSPP V2 API for field mapping.
        </p>
      </div>
      <div class="fetcher-header__actions">
        <v-btn
          v-if="fields.length > 0"
          variant="text"
          size="small"
          color="error"
          @click="clearFields"
        >
          Clear
        </v-btn>
        <v-btn
          :loading="isFetching"
          :disabled="!hasRequiredConfig"
          color="primary"
          variant="outlined"
          @click="fetchFields"
        >
          <v-icon start icon="mdi-cloud-download" />
          {{ fields.length > 0 ? 'Refresh Fields' : 'Fetch Fields' }}
        </v-btn>
      </div>
    </div>

    <!-- Configuration Warning -->
    <v-alert
      v-if="!hasRequiredConfig"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-4"
    >
      Configure the API URL and OAuth2 credentials in the Integration step to fetch fields.
    </v-alert>

    <!-- Error Alert -->
    <v-alert
      v-if="fetchError"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-4"
      closable
      @click:close="fetchError = null"
    >
      {{ fetchError }}
    </v-alert>

    <!-- Fields Summary -->
    <div v-if="fields.length > 0" class="fields-summary mt-4">
      <div class="summary-stats">
        <v-chip size="small" variant="tonal" color="success">
          {{ fields.length }} Total Fields
        </v-chip>
        <v-chip size="small" variant="tonal" color="primary">
          {{ coreFieldCount }} Core
        </v-chip>
        <v-chip size="small" variant="tonal" color="secondary">
          {{ studioFieldCount }} Studio
        </v-chip>
        <v-chip size="small" variant="tonal" color="info">
          {{ individualFields.length }} Individual
        </v-chip>
        <v-chip size="small" variant="tonal" color="info">
          {{ groupFields.length }} Group
        </v-chip>
      </div>
      <p v-if="lastFetchTime" class="fetch-time">
        Last updated: {{ lastFetchTime.toLocaleTimeString() }}
      </p>
    </div>

    <!-- Fields List -->
    <div v-if="fields.length > 0" class="fields-list mt-4">
      <v-expansion-panels variant="accordion">
        <!-- Individual Fields -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <div class="panel-title">
              <v-icon icon="mdi-account" size="small" class="mr-2" />
              Individual Fields
              <v-chip size="x-small" class="ml-2">{{ individualFields.length }}</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-table density="compact" class="fields-table">
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in individualFields" :key="field.name">
                  <td class="field-name">{{ field.name }}</td>
                  <td>{{ field.label }}</td>
                  <td>
                    <v-chip size="x-small" variant="tonal">
                      {{ getFieldTypeDisplay(field.type) }}
                    </v-chip>
                  </td>
                  <td>
                    <v-chip size="x-small" variant="tonal" :color="getSourceColor(field.source)">
                      {{ field.source }}
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Group Fields -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <div class="panel-title">
              <v-icon icon="mdi-account-group" size="small" class="mr-2" />
              Group Fields
              <v-chip size="x-small" class="ml-2">{{ groupFields.length }}</v-chip>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-table density="compact" class="fields-table">
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in groupFields" :key="field.name">
                  <td class="field-name">{{ field.name }}</td>
                  <td>{{ field.label }}</td>
                  <td>
                    <v-chip size="x-small" variant="tonal">
                      {{ getFieldTypeDisplay(field.type) }}
                    </v-chip>
                  </td>
                  <td>
                    <v-chip size="x-small" variant="tonal" :color="getSourceColor(field.source)">
                      {{ field.source }}
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <!-- Empty State -->
    <div v-else-if="hasRequiredConfig && !isFetching && !fetchError" class="empty-state mt-4">
      <v-icon icon="mdi-cloud-download-outline" size="48" color="grey-lighten-1" />
      <p>Click "Fetch Fields" to load available fields from OpenSPP V2</p>
    </div>
  </div>
</template>

<style scoped>
.v2-field-fetcher {
  padding: var(--spacing-md);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.fetcher-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.fetcher-header__info {
  flex: 1;
}

.fetcher-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0 0 var(--spacing-xs);
  color: var(--text-main);
}

.fetcher-description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin: 0;
}

.fetcher-header__actions {
  display: flex;
  gap: var(--spacing-sm);
}

.fields-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.summary-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.fetch-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 0;
}

.fields-list {
  background: var(--surface);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.panel-title {
  display: flex;
  align-items: center;
}

.fields-table {
  width: 100%;
}

.fields-table :deep(th) {
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
}

.fields-table :deep(td) {
  font-size: var(--font-size-sm);
}

.field-name {
  font-family: monospace;
  font-size: var(--font-size-xs);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--text-muted);
}

.empty-state p {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-sm);
}
</style>
