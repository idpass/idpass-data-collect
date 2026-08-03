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
/**
 * Reusable form for editing a {@link SyncScopePolicy} or
 * {@link SyncScopeOverride} (same shape). Form-only — does NOT call any API.
 * Caller wraps the save flow.
 *
 * - `v-model` carries the policy ({@link SyncScopePolicy} or null).
 * - `v-model:valid` carries a boolean: true when the in-flight form values
 *   would build a valid policy (no empty arrays for enabled toggles).
 * - When the form is "all empty" the policy is emitted as `null` (unbounded).
 */
import { computed, ref, watch } from 'vue'
import type {
  ScopeEntityType,
  SyncScopePolicy,
  TimeWindow,
} from '@idpass/data-collect-core'

interface Props {
  modelValue: SyncScopePolicy | null
  /** Disable inputs (e.g., while parent is saving). */
  disabled?: boolean
  /** Optional id prefix for `data-testid` attributes; defaults to `sync-scope`. */
  testIdPrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  testIdPrefix: 'sync-scope',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: SyncScopePolicy | null): void
  (e: 'update:valid', valid: boolean): void
  (e: 'update:error', error: string | null): void
}>()

// ---------- Local form state ----------
const areaIdsEnabled = ref(false)
const areaIdsText = ref('')
const entityTypesEnabled = ref(false)
const entityTypesIndividual = ref(false)
const entityTypesGroup = ref(false)
const timeWindowMode = ref<'none' | 'rolling' | 'fixed'>('none')
const timeWindowRollingDays = ref<number | null>(null)
const timeWindowFixedFloor = ref<string>('')

const tid = (suffix: string) => `${props.testIdPrefix}-${suffix}`

// Re-entrancy guard so emitted updates from within a watcher don't loop.
let suppressEmit = false

function loadFromPolicy(p: SyncScopePolicy | null | undefined) {
  suppressEmit = true
  try {
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
  } finally {
    suppressEmit = false
  }
}

watch(
  () => props.modelValue,
  (next) => loadFromPolicy(next ?? null),
  { immediate: true, deep: true },
)

function parseAreaIds(text: string): string[] {
  return text
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface BuildResult {
  policy: SyncScopePolicy | null
  error: string | null
}

/**
 * Translate the in-flight form values into a {@link SyncScopePolicy}.
 * Returns `policy: null` when every toggle is off (caller should emit `null`).
 */
function buildPolicy(): BuildResult {
  const out: SyncScopePolicy = {}
  let anyDimension = false

  // Areas
  if (areaIdsEnabled.value) {
    const ids = parseAreaIds(areaIdsText.value)
    if (ids.length === 0) {
      return { policy: out, error: 'Areas: remove or add at least one value' }
    }
    out.areaIds = ids
    anyDimension = true
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
    anyDimension = true
  } else {
    out.entityTypes = null
  }

  // Time window
  if (timeWindowMode.value === 'rolling') {
    const d = timeWindowRollingDays.value
    if (d == null || !Number.isFinite(d) || !Number.isInteger(d) || d <= 0) {
      return { policy: out, error: 'Time window: days must be a positive integer' }
    }
    out.timeWindow = { type: 'rolling', days: d }
    anyDimension = true
  } else if (timeWindowMode.value === 'fixed') {
    const floor = timeWindowFixedFloor.value
    if (!floor) {
      return { policy: out, error: 'Time window: floor datetime is required' }
    }
    let iso: string
    try {
      const d = new Date(floor)
      if (Number.isNaN(d.getTime())) throw new Error('invalid date')
      iso = d.toISOString()
    } catch {
      return { policy: out, error: 'Time window: invalid floor datetime' }
    }
    out.timeWindow = { type: 'fixed', floor: iso } satisfies TimeWindow
    anyDimension = true
  } else {
    out.timeWindow = null
  }

  if (!anyDimension) {
    // All toggles off => unbounded => null. The caller's "save" button is
    // enabled and produces a null policy (clear).
    return { policy: null, error: null }
  }

  return { policy: out, error: null }
}

const buildResult = computed<BuildResult>(() => buildPolicy())

/** True iff the form would build a valid policy (or null) right now. */
const isValid = computed<boolean>(() => buildResult.value.error == null)

/** Inline error message from the latest build attempt, or null. */
const validationError = computed<string | null>(() => buildResult.value.error)

// Emit whenever the user touches anything. We intentionally re-emit on every
// keystroke; the caller can debounce if needed.
watch(
  buildResult,
  (next) => {
    if (suppressEmit) return
    emit('update:valid', next.error == null)
    emit('update:error', next.error)
    if (next.error == null) {
      emit('update:modelValue', next.policy)
    }
  },
  { deep: true },
)

// Public API for callers that need a one-shot build (e.g., "Save" handler).
defineExpose({
  build: () => buildPolicy(),
  isValid,
  validationError,
})
</script>

<template>
  <div class="sync-scope-form">
    <!-- Areas -->
    <div class="sync-scope-form__section">
      <v-checkbox
        v-model="areaIdsEnabled"
        :disabled="disabled"
        label="Restrict by area IDs"
        density="compact"
        hide-details
        :data-testid="tid('areas-toggle')"
      />
      <v-textarea
        v-if="areaIdsEnabled"
        v-model="areaIdsText"
        :disabled="disabled"
        label="Area IDs (comma- or newline-separated)"
        variant="outlined"
        density="compact"
        rows="2"
        auto-grow
        hint="Example: A1, A2, A3"
        persistent-hint
        :data-testid="tid('areas-input')"
      />
    </div>

    <!-- Entity types -->
    <div class="sync-scope-form__section">
      <v-checkbox
        v-model="entityTypesEnabled"
        :disabled="disabled"
        label="Restrict by entity types"
        density="compact"
        hide-details
        :data-testid="tid('types-toggle')"
      />
      <div v-if="entityTypesEnabled" class="sync-scope-form__inline-checks">
        <v-checkbox
          v-model="entityTypesIndividual"
          :disabled="disabled"
          label="individual"
          density="compact"
          hide-details
          :data-testid="tid('types-individual')"
        />
        <v-checkbox
          v-model="entityTypesGroup"
          :disabled="disabled"
          label="group"
          density="compact"
          hide-details
          :data-testid="tid('types-group')"
        />
      </div>
    </div>

    <!-- Time window -->
    <div class="sync-scope-form__section">
      <p class="sync-scope-form__section-label">Time window</p>
      <v-radio-group
        v-model="timeWindowMode"
        :disabled="disabled"
        density="compact"
        hide-details
        :data-testid="tid('time-mode')"
      >
        <v-radio label="No time limit" value="none" />
        <v-radio label="Rolling window (days)" value="rolling" />
        <v-radio label="Fixed floor (datetime)" value="fixed" />
      </v-radio-group>
      <v-text-field
        v-if="timeWindowMode === 'rolling'"
        v-model.number="timeWindowRollingDays"
        :disabled="disabled"
        type="number"
        min="1"
        step="1"
        label="Days"
        variant="outlined"
        density="compact"
        hide-details="auto"
        class="mt-2"
        :data-testid="tid('time-days')"
      />
      <v-text-field
        v-if="timeWindowMode === 'fixed'"
        v-model="timeWindowFixedFloor"
        :disabled="disabled"
        type="datetime-local"
        label="Floor datetime"
        variant="outlined"
        density="compact"
        hide-details="auto"
        class="mt-2"
        :data-testid="tid('time-floor')"
      />
    </div>
  </div>
</template>

<style scoped>
.sync-scope-form__section {
  margin-bottom: 16px;
}

.sync-scope-form__section-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 4px;
}

.sync-scope-form__inline-checks {
  display: flex;
  gap: 16px;
  margin-left: 8px;
}
</style>
