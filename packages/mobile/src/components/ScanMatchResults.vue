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

import type { MatchResult } from '@/scanner/types'

const props = defineProps<{
  matches: MatchResult[]
  visible: boolean
}>()

const emit = defineEmits<{
  select: [match: MatchResult]
  'create-new': []
  close: []
}>()

const resolveEntityName = (match: MatchResult): string => {
  const nameFromData = match.entity.data.name
  if (typeof nameFromData === 'string' && nameFromData.trim()) {
    return nameFromData.trim()
  }
  if (match.entity.name?.trim()) {
    return match.entity.name.trim()
  }
  return 'Unnamed'
}

const scoreIndicatorClass = (score: number): string => {
  if (score >= 0.9) return 'score-dot--high'
  if (score >= 0.7) return 'score-dot--medium'
  return 'score-dot--low'
}
</script>

<template>
  <div v-if="props.visible" class="match-results-overlay" role="dialog" aria-modal="true" aria-label="Match Results">
    <div class="match-results-backdrop" @click="emit('close')"></div>

    <div class="match-results-sheet">
      <!-- Drag handle -->
      <div class="sheet-handle" aria-hidden="true"></div>

      <!-- Header -->
      <header class="sheet-header">
        <h2 class="sheet-title">Match Results</h2>
        <button
          class="close-button"
          type="button"
          @click="emit('close')"
          aria-label="Close match results"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              fill="currentColor"
            />
          </svg>
        </button>
      </header>

      <!-- Match list -->
      <ul class="match-list" role="list">
        <li
          v-for="match in props.matches"
          :key="match.entity.guid"
          class="match-card"
          @click="emit('select', match)"
        >
          <div class="match-card__body">
            <div class="match-card__top">
              <span class="score-dot" :class="scoreIndicatorClass(match.score)" aria-hidden="true"></span>
              <span class="match-card__name">{{ resolveEntityName(match) }}</span>
            </div>
            <p class="match-card__detail">
              <span class="match-card__field">{{ match.matchedField }}</span>:
              <span class="match-card__value">{{ match.matchedValue }}</span>
            </p>
          </div>

          <svg class="match-card__chevron" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              d="M9.29 6.71 13.17 10.59 9.29 14.47 10.71 15.88 16 10.59 10.71 5.29z"
              fill="currentColor"
            />
          </svg>
        </li>

        <li v-if="!props.matches.length" class="match-empty">
          <p>No matching records found.</p>
        </li>
      </ul>

      <!-- Create new button -->
      <div class="sheet-footer">
        <button
          class="create-new-button"
          type="button"
          @click="emit('create-new')"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
          </svg>
          Create New
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-results-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.match-results-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(26, 32, 44, 0.4);
}

.match-results-sheet {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(480px, 100%);
  max-height: 85vh;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  padding: 0.75rem 1.25rem 1.5rem;
  box-shadow: 0 -8px 40px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #e5e7eb;
  align-self: center;
  margin-bottom: 0.25rem;
  flex-shrink: 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.sheet-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
}

.close-button {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #f3f4f6;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #374151;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.close-button:active {
  background: #e5e7eb;
}

.close-button svg {
  width: 18px;
  height: 18px;
}

.match-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.match-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.875rem 1rem;
  background: #f9fafb;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.match-card:active {
  transform: scale(0.99);
}

.match-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.match-card__top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.score-dot--high {
  background: #10b981;
}

.score-dot--medium {
  background: #f59e0b;
}

.score-dot--low {
  background: #9ca3af;
}

.match-card__name {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-card__detail {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-card__field {
  font-weight: 600;
}

.match-card__value {
  font-weight: 400;
}

.match-card__chevron {
  width: 20px;
  height: 20px;
  color: #9ca3af;
  flex-shrink: 0;
}

.match-empty {
  text-align: center;
  padding: 2rem 1.5rem;
  background: #f9fafb;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #6b7280;
  font-size: 0.95rem;
}

.match-empty p {
  margin: 0;
}

.sheet-footer {
  padding-top: 0.25rem;
}

.create-new-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: #ffffff;
  border: none;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
  transition: opacity 0.15s ease;
}

.create-new-button:active {
  opacity: 0.9;
}

.create-new-button svg {
  width: 20px;
  height: 20px;
}
</style>
