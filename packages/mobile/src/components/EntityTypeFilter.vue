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
export interface EntityTypeChip {
  /** Form name (acts as id). Use `'all'` for the catch-all chip. */
  value: string
  /** Label shown to user (e.g. form title). */
  label: string
  /** Optional count shown after the label. */
  count?: number
}

interface Props {
  modelValue: string
  chips: EntityTypeChip[]
}

defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const onSelect = (value: string) => emit('update:modelValue', value)
</script>

<template>
  <div class="entity-type-filter" role="tablist">
    <button
      v-for="chip in chips"
      :key="chip.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === chip.value"
      :class="['entity-type-chip', { 'entity-type-chip--active': modelValue === chip.value }]"
      @click="onSelect(chip.value)"
    >
      <span class="entity-type-chip__label">{{ chip.label }}</span>
      <span v-if="chip.count !== undefined" class="entity-type-chip__count">{{ chip.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.entity-type-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0;
}

.entity-type-filter::-webkit-scrollbar {
  display: none;
}

.entity-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: var(--surface, #fff);
  color: rgba(0, 0, 0, 0.78);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

.entity-type-chip:hover {
  background: rgba(0, 0, 0, 0.04);
}

.entity-type-chip--active {
  background: rgba(255, 109, 55, 0.12);
  border-color: rgba(255, 109, 55, 0.4);
  color: #b94612;
}

.entity-type-chip__count {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
}

.entity-type-chip--active .entity-type-chip__count {
  opacity: 1;
}

@media (prefers-color-scheme: dark) {
  .entity-type-chip {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.84);
  }
  .entity-type-chip:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .entity-type-chip--active {
    background: rgba(255, 109, 55, 0.18);
    color: #ffd1bd;
  }
}
</style>
