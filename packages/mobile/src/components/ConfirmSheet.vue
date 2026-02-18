<script setup lang="ts">
/*
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
 */

withDefaults(
  defineProps<{
    visible: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel'
  }
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div
    v-if="visible"
    class="confirm-overlay"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-sheet-title"
  >
    <div class="confirm-backdrop" @click="emit('cancel')"></div>

    <div class="confirm-sheet">
      <!-- Drag handle -->
      <div class="sheet-handle" aria-hidden="true"></div>

      <!-- Header -->
      <h2 id="confirm-sheet-title" class="sheet-title">{{ title }}</h2>

      <!-- Message -->
      <p class="sheet-message">{{ message }}</p>

      <!-- Actions -->
      <div class="sheet-actions">
        <button
          class="sheet-button sheet-button--cancel"
          type="button"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
        <button
          class="sheet-button sheet-button--confirm"
          type="button"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.confirm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(26, 32, 44, 0.4);
}

.confirm-sheet {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(480px, 100%);
  background: var(--surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: 0.75rem var(--spacing-lg) var(--spacing-lg);
  box-shadow: 0 -8px 40px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--neutral-100);
  align-self: center;
  margin-bottom: var(--spacing-xs);
  flex-shrink: 0;
}

.sheet-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.sheet-message {
  font-size: 0.95rem;
  color: var(--text-muted);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.sheet-actions {
  display: flex;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
}

.sheet-button {
  flex: 1;
  min-height: var(--touch-target);
  border: none;
  border-radius: var(--radius-lg);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.sheet-button:active {
  opacity: 0.9;
}

.sheet-button--cancel {
  background: var(--neutral-100);
  color: var(--text-main);
}

.sheet-button--confirm {
  background: var(--brand);
  color: var(--text-inverted);
}
</style>
