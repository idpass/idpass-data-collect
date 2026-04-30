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
import { computed, ref, watch } from 'vue'
import { AxiosError } from 'axios'
import { updateAppSyncScope } from '@/api'
import type { SyncScopePolicy, ScopeEntityType, TimeWindow } from '@idpass/data-collect-core'

interface Props {
  appId: string
  policy: SyncScopePolicy | null | undefined
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:policy', policy: SyncScopePolicy | null): void
}>()

// ---------- Read-view summary ----------
const isUnbounded = computed(() => {
  const p = props.policy
  if (!p) return true
  const noAreas = p.areaIds == null || p.areaIds.length === 0
  const noTypes = p.entityTypes == null || p.entityTypes.length === 0
  const noTime = p.timeWindow == null
  return noAreas && noTypes && noTime
})

function describeTimeWindow(tw: TimeWindow | null | undefined): string {
  if (!tw) return 'no time limit'
  if (tw.type === 'rolling') return `last ${tw.days}d`
  return `since ${tw.floor.slice(0, 10)}`
}

const summaryLine = computed(() => {
  if (isUnbounded.value) return 'Unbounded'
  const p = props.policy ?? {}
  const areaCount = p.areaIds?.length ?? 0
  const typesLabel = p.entityTypes && p.entityTypes.length > 0 ? p.entityTypes.join('+') : 'all'
  return `${areaCount} areas · ${typesLabel} types · ${describeTimeWindow(p.timeWindow ?? null)}`
})

// ---------- Edit dialog state ----------
const showEdit = ref(false)
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const validationError = ref<string | null>(null)

// Form fields
const areaIdsEnabled = ref(false)
const areaIdsText = ref('')
const entityTypesEnabled = ref(false)
const entityTypesIndividual = ref(false)
const entityTypesGroup = ref(false)
const timeWindowMode = ref<'none' | 'rolling' | 'fixed'>('none')
const timeWindowRollingDays = ref<number | null>(null)
const timeWindowFixedFloor = ref<string>('')

function loadFromPolicy() {
  errorMessage.value = null
  validationError.value = null
  const p = props.policy
  if (!p) {
    areaIdsEnabled.value = false
    areaIdsText.value = ''
    entityTypesEnabled.value = false
    entityTypesIndividual.value = false
    entityTypesGroup.value = false
    timeWindowMode.value = 'none'
    timeWindowRollingDays.value = null
    timeWindowFixedFloor.value = ''
    return
  }
  areaIdsEnabled.value = Array.isArray(p.areaIds) && p.areaIds.length > 0
  areaIdsText.value = (p.areaIds ?? []).join(', ')
  entityTypesEnabled.value = Array.isArray(p.entityTypes) && p.entityTypes.length > 0
  entityTypesIndividual.value = (p.entityTypes ?? []).includes('individual')
  entityTypesGroup.value = (p.entityTypes ?? []).includes('group')
  if (p.timeWindow?.type === 'rolling') {
    timeWindowMode.value = 'rolling'
    timeWindowRollingDays.value = p.timeWindow.days
    timeWindowFixedFloor.value = ''
  } else if (p.timeWindow?.type === 'fixed') {
    timeWindowMode.value = 'fixed'
    timeWindowRollingDays.value = null
    timeWindowFixedFloor.value = p.timeWindow.floor
  } else {
    timeWindowMode.value = 'none'
    timeWindowRollingDays.value = null
    timeWindowFixedFloor.value = ''
  }
}

watch(showEdit, (open) => {
  if (open) loadFromPolicy()
})

function openEdit() {
  showEdit.value = true
}

function closeEdit() {
  if (saving.value) return
  showEdit.value = false
}

// ---------- Build payload ----------
function parseAreaIds(text: string): string[] {
  return text
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface BuildResult {
  policy: SyncScopePolicy
  error: string | null
}

function buildPolicy(): BuildResult {
  const out: SyncScopePolicy = {}

  // Areas
  if (areaIdsEnabled.value) {
    const ids = parseAreaIds(areaIdsText.value)
    if (ids.length === 0) {
      return {
        policy: out,
        error: 'Areas: remove or add at least one value',
      }
    }
    out.areaIds = ids
  } else {
    out.areaIds = null
  }

  // Entity types
  if (entityTypesEnabled.value) {
    const types: ScopeEntityType[] = []
    if (entityTypesIndividual.value) types.push('individual')
    if (entityTypesGroup.value) types.push('group')
    if (types.length === 0) {
      return {
        policy: out,
        error: 'Entity types: remove or add at least one value',
      }
    }
    out.entityTypes = types
  } else {
    out.entityTypes = null
  }

  // Time window
  if (timeWindowMode.value === 'rolling') {
    const d = timeWindowRollingDays.value
    if (d == null || !Number.isFinite(d) || !Number.isInteger(d) || d <= 0) {
      return {
        policy: out,
        error: 'Time window: days must be a positive integer',
      }
    }
    out.timeWindow = { type: 'rolling', days: d }
  } else if (timeWindowMode.value === 'fixed') {
    const floor = timeWindowFixedFloor.value
    if (!floor) {
      return { policy: out, error: 'Time window: floor datetime is required' }
    }
    // Coerce into ISO datetime; <input type=datetime-local> values omit the timezone.
    let iso: string
    try {
      const d = new Date(floor)
      if (Number.isNaN(d.getTime())) throw new Error('invalid date')
      iso = d.toISOString()
    } catch {
      return { policy: out, error: 'Time window: invalid floor datetime' }
    }
    out.timeWindow = { type: 'fixed', floor: iso }
  } else {
    out.timeWindow = null
  }

  return { policy: out, error: null }
}

async function onSave() {
  validationError.value = null
  errorMessage.value = null
  const built = buildPolicy()
  if (built.error) {
    validationError.value = built.error
    return
  }
  saving.value = true
  try {
    const res = await updateAppSyncScope(props.appId, built.policy)
    emit('update:policy', res.syncScope ?? built.policy)
    showEdit.value = false
  } catch (err) {
    if (err instanceof AxiosError) {
      const data = err.response?.data as { message?: string; error?: string } | undefined
      errorMessage.value = data?.message || data?.error || err.message || 'Failed to save sync scope.'
    } else if (err instanceof Error) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to save sync scope.'
    }
  } finally {
    saving.value = false
  }
}

const showClearConfirm = ref(false)

function onClearRequest() {
  if (saving.value) return
  showClearConfirm.value = true
}

async function onClearConfirm() {
  errorMessage.value = null
  validationError.value = null
  saving.value = true
  try {
    const res = await updateAppSyncScope(props.appId, null)
    emit('update:policy', res.syncScope ?? null)
    showClearConfirm.value = false
    showEdit.value = false
  } catch (err) {
    if (err instanceof AxiosError) {
      const data = err.response?.data as { message?: string; error?: string } | undefined
      errorMessage.value = data?.message || data?.error || err.message || 'Failed to clear sync scope.'
    } else if (err instanceof Error) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to clear sync scope.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-card class="sync-scope-card" border="md" elevation="0">
    <v-card-text class="sync-scope-card__body">
      <div class="sync-scope-card__header">
        <div class="sync-scope-card__title">
          <v-icon icon="mdi-radar" size="20" class="mr-2" />
          <span>Sync scope</span>
        </div>
        <v-btn
          data-testid="sync-scope-edit-btn"
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-pencil"
          @click="openEdit"
        >
          Edit
        </v-btn>
      </div>

      <div class="sync-scope-card__summary" data-testid="sync-scope-summary">
        <span v-if="isUnbounded" class="sync-scope-card__chip sync-scope-card__chip--muted">
          {{ summaryLine }}
        </span>
        <span v-else class="sync-scope-card__chip sync-scope-card__chip--scoped">
          {{ summaryLine }}
        </span>
        <p class="sync-scope-card__hint">
          Limits which records sync to devices for this program. Unbounded means every device
          receives the full dataset.
        </p>
      </div>
    </v-card-text>

    <!-- Edit Dialog -->
    <v-dialog v-model="showEdit" :max-width="560" persistent>
      <v-card>
        <v-card-title class="text-h6">
          <v-icon icon="mdi-radar" start />
          Edit sync scope
        </v-card-title>
        <v-card-text class="sync-scope-card__form">
          <v-alert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-testid="sync-scope-error"
          >
            {{ errorMessage }}
          </v-alert>

          <v-alert
            v-if="validationError"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-testid="sync-scope-validation"
          >
            {{ validationError }}
          </v-alert>

          <!-- Areas -->
          <div class="sync-scope-card__section">
            <v-checkbox
              v-model="areaIdsEnabled"
              :disabled="saving"
              label="Restrict by area IDs"
              density="compact"
              hide-details
              data-testid="sync-scope-areas-toggle"
            />
            <v-textarea
              v-if="areaIdsEnabled"
              v-model="areaIdsText"
              :disabled="saving"
              label="Area IDs (comma- or newline-separated)"
              variant="outlined"
              density="compact"
              rows="2"
              auto-grow
              hint="Example: A1, A2, A3"
              persistent-hint
              data-testid="sync-scope-areas-input"
            />
          </div>

          <!-- Entity types -->
          <div class="sync-scope-card__section">
            <v-checkbox
              v-model="entityTypesEnabled"
              :disabled="saving"
              label="Restrict by entity types"
              density="compact"
              hide-details
              data-testid="sync-scope-types-toggle"
            />
            <div v-if="entityTypesEnabled" class="sync-scope-card__inline-checks">
              <v-checkbox
                v-model="entityTypesIndividual"
                :disabled="saving"
                label="individual"
                density="compact"
                hide-details
                data-testid="sync-scope-types-individual"
              />
              <v-checkbox
                v-model="entityTypesGroup"
                :disabled="saving"
                label="group"
                density="compact"
                hide-details
                data-testid="sync-scope-types-group"
              />
            </div>
          </div>

          <!-- Time window -->
          <div class="sync-scope-card__section">
            <p class="sync-scope-card__section-label">Time window</p>
            <v-radio-group
              v-model="timeWindowMode"
              :disabled="saving"
              density="compact"
              hide-details
              data-testid="sync-scope-time-mode"
            >
              <v-radio label="No time limit" value="none" />
              <v-radio label="Rolling window (days)" value="rolling" />
              <v-radio label="Fixed floor (datetime)" value="fixed" />
            </v-radio-group>
            <v-text-field
              v-if="timeWindowMode === 'rolling'"
              v-model.number="timeWindowRollingDays"
              :disabled="saving"
              type="number"
              min="1"
              step="1"
              label="Days"
              variant="outlined"
              density="compact"
              hide-details="auto"
              class="mt-2"
              data-testid="sync-scope-time-days"
            />
            <v-text-field
              v-if="timeWindowMode === 'fixed'"
              v-model="timeWindowFixedFloor"
              :disabled="saving"
              type="datetime-local"
              label="Floor datetime"
              variant="outlined"
              density="compact"
              hide-details="auto"
              class="mt-2"
              data-testid="sync-scope-time-floor"
            />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn
            data-testid="sync-scope-clear-btn"
            color="error"
            variant="text"
            :disabled="saving"
            @click="onClearRequest"
          >
            Clear policy
          </v-btn>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="closeEdit">Cancel</v-btn>
          <v-btn
            data-testid="sync-scope-save-btn"
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="saving"
            @click="onSave"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Clear-confirm dialog -->
    <v-dialog v-model="showClearConfirm" :max-width="420">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon icon="mdi-alert" start color="warning" />
          Clear sync scope policy?
        </v-card-title>
        <v-card-text>
          Removing the policy will allow all devices in this program to sync the entire dataset.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="showClearConfirm = false">Cancel</v-btn>
          <v-btn
            data-testid="sync-scope-clear-confirm-btn"
            color="error"
            variant="tonal"
            :loading="saving"
            @click="onClearConfirm"
          >
            Clear policy
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.sync-scope-card {
  border-radius: var(--radius-xl);
  background: var(--surface);
  margin-bottom: var(--spacing-lg, 16px);
}

.sync-scope-card__body {
  padding: var(--spacing-md, 16px);
}

.sync-scope-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm, 8px);
  margin-bottom: var(--spacing-sm, 8px);
}

.sync-scope-card__title {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--text-main);
}

.sync-scope-card__summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sync-scope-card__chip {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
}

.sync-scope-card__chip--muted {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.sync-scope-card__chip--scoped {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.sync-scope-card__hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0;
}

.sync-scope-card__form {
  padding-top: 8px;
}

.sync-scope-card__section {
  margin-bottom: 16px;
}

.sync-scope-card__section-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 4px;
}

.sync-scope-card__inline-checks {
  display: flex;
  gap: 16px;
  margin-left: 8px;
}
</style>
