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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConflictsStore } from '@/stores/conflicts'
import { useSnackBarStore } from '@/stores/snackBar'
import type { ConflictRecord } from '@/api'

const route = useRoute()
const router = useRouter()
const conflictsStore = useConflictsStore()
const snackBarStore = useSnackBarStore()

const configId = ref(route.params.id as string)

const showResolveDialog = ref(false)
const selectedConflict = ref<ConflictRecord | null>(null)
const selectedResolution = ref<'local' | 'remote' | 'merged'>('local')
const mergedDataJson = ref('')
const saving = ref(false)

const headers = [
  { title: 'Entity GUID', value: 'entityGuid', sortable: true },
  { title: 'Detected', value: 'detectedAt', sortable: true },
  { title: 'Local Event', value: 'localEventGuid', sortable: false },
  { title: 'Remote Event', value: 'remoteEventGuid', sortable: false },
  { title: 'Actions', value: 'actions', sortable: false },
]

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const now = Date.now()
  const diffMs = now - then
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

const truncate = (val: string, n = 12): string =>
  val && val.length > n ? `${val.substring(0, n)}...` : val

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    snackBarStore.showSnackbar('Copied to clipboard', 'success')
  } catch {
    snackBarStore.showSnackbar('Failed to copy', 'error')
  }
}

const openResolveDialog = (conflict: ConflictRecord) => {
  selectedConflict.value = conflict
  selectedResolution.value = 'local'
  mergedDataJson.value = JSON.stringify(conflict.localVersion ?? {}, null, 2)
  showResolveDialog.value = true
}

const closeResolveDialog = () => {
  showResolveDialog.value = false
  selectedConflict.value = null
}

const parsedMergedData = computed<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }>(() => {
  try {
    const parsed = JSON.parse(mergedDataJson.value)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Merged data must be a JSON object' }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
})

const mergedDataError = computed(() =>
  selectedResolution.value === 'merged' && !parsedMergedData.value.ok
    ? parsedMergedData.value.error
    : '',
)

const saveDisabled = computed(() => {
  if (saving.value) return true
  if (selectedResolution.value === 'merged' && !parsedMergedData.value.ok) return true
  return false
})

const handleSave = async () => {
  if (!selectedConflict.value) return
  saving.value = true
  try {
    const payload: {
      guid: string
      configId: string
      resolution: 'local' | 'remote' | 'merged'
      mergedData?: Record<string, unknown>
    } = {
      guid: selectedConflict.value.guid,
      configId: configId.value,
      resolution: selectedResolution.value,
    }
    if (selectedResolution.value === 'merged' && parsedMergedData.value.ok) {
      payload.mergedData = parsedMergedData.value.value
    }
    await conflictsStore.resolve(payload)
    snackBarStore.showSnackbar('Conflict resolved', 'success')
    closeResolveDialog()
  } catch (error) {
    snackBarStore.showSnackbar('Failed to resolve conflict', 'error')
    console.error('Failed to resolve conflict', error)
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  router.push({ name: 'app-details', params: { id: configId.value } })
}

const refresh = () => {
  conflictsStore.fetchConflicts(configId.value)
}

onMounted(() => {
  refresh()
})

watch(
  () => route.params.id,
  (newId) => {
    if (typeof newId === 'string' && newId !== configId.value) {
      configId.value = newId
      refresh()
    }
  },
)
</script>

<template>
  <v-container>
    <div class="subpage-nav">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
        Collection Program
      </v-btn>
    </div>

    <div class="page-header">
      <div class="page-header__text">
        <h1 class="page-header__title">Conflicts</h1>
        <p class="page-header__subtitle">
          Review and resolve version conflicts detected during sync
        </p>
      </div>
      <div class="page-header__actions">
        <v-btn
          variant="text"
          prepend-icon="mdi-refresh"
          :loading="conflictsStore.loading"
          @click="refresh"
        >
          Refresh
        </v-btn>
      </div>
    </div>

    <v-alert
      v-if="conflictsStore.error"
      type="error"
      variant="tonal"
      class="mb-4"
      data-testid="conflicts-error"
    >
      {{ conflictsStore.error }}
    </v-alert>

    <div
      v-if="conflictsStore.loading && conflictsStore.conflicts.length === 0"
      class="loading-wrap"
    >
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert
      v-else-if="!conflictsStore.hasConflicts"
      type="info"
      variant="tonal"
      class="mb-4"
      data-testid="conflicts-empty-state"
    >
      No unresolved conflicts.
    </v-alert>

    <v-data-table
      v-else
      :headers="headers"
      :items="conflictsStore.conflicts"
      :loading="conflictsStore.loading"
      item-value="guid"
      class="conflicts-table"
    >
      <template #[`item.entityGuid`]="{ item }">
        <span
          class="entity-guid"
          :title="item.entityGuid"
          :data-testid="`conflict-row-${item.guid}`"
        >
          {{ truncate(item.entityGuid) }}
        </span>
        <v-btn
          variant="text"
          size="x-small"
          icon="mdi-content-copy"
          :title="`Copy ${item.entityGuid}`"
          @click="copyToClipboard(item.entityGuid)"
        />
      </template>

      <template #[`item.detectedAt`]="{ item }">
        <span :title="item.detectedAt">{{ formatRelativeTime(item.detectedAt) }}</span>
      </template>

      <template #[`item.localEventGuid`]="{ item }">
        <span class="entity-guid" :title="item.localEventGuid">
          {{ truncate(item.localEventGuid) }}
        </span>
      </template>

      <template #[`item.remoteEventGuid`]="{ item }">
        <span class="entity-guid" :title="item.remoteEventGuid">
          {{ truncate(item.remoteEventGuid) }}
        </span>
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-merge"
          :data-testid="`conflict-resolve-btn-${item.guid}`"
          @click="openResolveDialog(item)"
        >
          Resolve
        </v-btn>
      </template>
    </v-data-table>

    <!-- Resolve Dialog -->
    <v-dialog v-model="showResolveDialog" :max-width="900">
      <v-card v-if="selectedConflict" data-testid="resolve-dialog">
        <v-card-title class="text-h6">
          Resolve conflict for {{ truncate(selectedConflict.entityGuid, 24) }}
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-card variant="outlined">
                <v-card-subtitle>Local version</v-card-subtitle>
                <v-card-text>
                  <pre class="payload">{{ JSON.stringify(selectedConflict.localVersion, null, 2) }}</pre>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="12" md="6">
              <v-card variant="outlined">
                <v-card-subtitle>Remote version</v-card-subtitle>
                <v-card-text>
                  <pre class="payload">{{ JSON.stringify(selectedConflict.remoteVersion, null, 2) }}</pre>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <v-radio-group
            v-model="selectedResolution"
            label="Resolution"
            class="mt-4"
            data-testid="resolve-radio-group"
          >
            <v-radio
              label="Keep local"
              value="local"
              data-testid="resolve-radio-local"
            />
            <v-radio
              label="Apply remote"
              value="remote"
              data-testid="resolve-radio-remote"
            />
            <v-radio
              label="Merge"
              value="merged"
              data-testid="resolve-radio-merged"
            />
          </v-radio-group>

          <v-textarea
            v-if="selectedResolution === 'merged'"
            v-model="mergedDataJson"
            label="Merged data (JSON object)"
            rows="10"
            variant="outlined"
            :error-messages="mergedDataError ? [mergedDataError] : []"
            data-testid="merged-data-input"
            class="merged-textarea"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            data-testid="resolve-cancel-btn"
            :disabled="saving"
            @click="closeResolveDialog"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :loading="saving"
            :disabled="saveDisabled"
            data-testid="resolve-save-btn"
            @click="handleSave"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.entity-guid {
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.conflicts-table {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-card);
}

.payload {
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
  background: var(--surface-muted, #f7f7f7);
  padding: 8px;
  border-radius: 4px;
}

.merged-textarea {
  font-family: monospace;
}

.loading-wrap {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
