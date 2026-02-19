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

import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseAutoSaveOptions {
  debounceMs?: number
  maxRetries?: number
}

export interface UseAutoSaveReturn {
  saveStatus: Ref<AutoSaveStatus>
  lastSavedAt: Ref<Date | null>
  saveNow: () => Promise<void>
  reset: () => void
}

export function useAutoSave(
  formData: Ref<Record<string, unknown>>,
  saveFn: (data: Record<string, unknown>) => Promise<void>,
  options?: UseAutoSaveOptions,
): UseAutoSaveReturn {
  const debounceMs = options?.debounceMs ?? 5000
  const maxRetries = options?.maxRetries ?? 3

  const saveStatus = ref<AutoSaveStatus>('idle')
  const lastSavedAt = ref<Date | null>(null)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryCount = 0

  async function attemptSave(data: Record<string, unknown>): Promise<void> {
    saveStatus.value = 'saving'
    try {
      await saveFn(data)
      saveStatus.value = 'saved'
      lastSavedAt.value = new Date()
      retryCount = 0
    } catch {
      if (retryCount < maxRetries) {
        retryCount++
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, retryCount - 1) * 1000
        debounceTimer = setTimeout(() => {
          void attemptSave(data)
        }, backoffMs)
      } else {
        saveStatus.value = 'error'
        retryCount = 0
      }
    }
  }

  watch(
    formData,
    (newData) => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        void attemptSave(newData)
      }, debounceMs)
    },
    { deep: true },
  )

  async function saveNow(): Promise<void> {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await attemptSave(formData.value)
  }

  function reset(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    saveStatus.value = 'idle'
    lastSavedAt.value = null
    retryCount = 0
  }

  // Clean up pending timers when the component is unmounted (only in component context)
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    })
  }

  return {
    saveStatus,
    lastSavedAt,
    saveNow,
    reset,
  }
}
