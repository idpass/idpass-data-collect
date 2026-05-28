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
import type { AppProgram } from '@/api'

interface Props {
  programs: AppProgram[]
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{
  (e: 'update:programs', programs: AppProgram[]): void
}>()

const list = computed({
  get: () => props.programs,
  set: (v: AppProgram[]) => emit('update:programs', v),
})

const addRow = () => {
  list.value = [...list.value, { id: 0, name: '', code: '' }]
}

const removeRow = (idx: number) => {
  list.value = list.value.filter((_, i) => i !== idx)
}

const updateRow = (idx: number, patch: Partial<AppProgram>) => {
  list.value = list.value.map((row, i) => (i === idx ? { ...row, ...patch } : row))
}

const idError = (row: AppProgram) =>
  !Number.isInteger(row.id) || row.id <= 0 ? 'Positive integer required' : undefined

const nameError = (row: AppProgram) => (!row.name.trim() ? 'Name is required' : undefined)
</script>

<template>
  <div class="programs-editor">
    <p v-if="list.length === 0" class="empty-hint">
      No programs configured. The mobile "Enroll in Program" picker stays hidden until at least one
      entry is added.
    </p>

    <div
      v-for="(row, idx) in list"
      :key="idx"
      class="program-row"
      data-testid="program-row"
    >
      <v-text-field
        :model-value="row.id || null"
        type="number"
        label="OpenSPP program id"
        density="compact"
        variant="outlined"
        hide-details="auto"
        :disabled="disabled"
        :error-messages="idError(row)"
        class="program-row__id"
        @update:model-value="(v) => updateRow(idx, { id: parseInt(String(v ?? '0'), 10) || 0 })"
      />
      <v-text-field
        :model-value="row.name"
        label="Display name"
        density="compact"
        variant="outlined"
        hide-details="auto"
        :disabled="disabled"
        :error-messages="nameError(row)"
        class="program-row__name"
        @update:model-value="(v) => updateRow(idx, { name: String(v ?? '') })"
      />
      <v-text-field
        :model-value="row.code ?? ''"
        label="Code (optional)"
        density="compact"
        variant="outlined"
        hide-details
        :disabled="disabled"
        class="program-row__code"
        @update:model-value="(v) => updateRow(idx, { code: String(v ?? '') })"
      />
      <v-btn
        icon="mdi-delete"
        variant="text"
        color="error"
        size="small"
        :disabled="disabled"
        :aria-label="`Remove program ${idx + 1}`"
        @click="removeRow(idx)"
      />
    </div>

    <v-btn
      color="primary"
      variant="tonal"
      size="small"
      prepend-icon="mdi-plus"
      :disabled="disabled"
      class="programs-editor__add"
      @click="addRow"
    >
      Add program
    </v-btn>
  </div>
</template>

<style scoped>
.programs-editor {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 12px);
}

.empty-hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin: 0 0 var(--spacing-sm) 0;
}

.program-row {
  display: grid;
  grid-template-columns: 140px 1fr 160px 40px;
  gap: var(--spacing-sm, 8px);
  align-items: start;
}

.programs-editor__add {
  align-self: flex-start;
}

@media (max-width: 600px) {
  .program-row {
    grid-template-columns: 1fr;
  }
}
</style>
