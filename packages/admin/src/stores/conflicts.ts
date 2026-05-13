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

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getConflicts as getConflictsApi,
  resolveConflict as resolveConflictApi,
} from '@/api'
import type { ConflictRecord } from '@/api'

export const useConflictsStore = defineStore('conflicts', () => {
  // State
  const conflicts = ref<ConflictRecord[]>([])
  const unresolvedCount = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const hasConflicts = computed(() => conflicts.value.length > 0)

  // Actions
  const fetchConflicts = async (configId: string) => {
    loading.value = true
    error.value = null
    try {
      const result = await getConflictsApi(configId)
      conflicts.value = result.conflicts
      unresolvedCount.value = result.unresolvedCount
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const resolve = async (params: {
    guid: string
    configId: string
    resolution: 'local' | 'remote' | 'merged'
    mergedData?: Record<string, unknown>
  }) => {
    await resolveConflictApi(params)
    // Refresh after resolving
    await fetchConflicts(params.configId)
  }

  return {
    conflicts,
    unresolvedCount,
    loading,
    error,
    hasConflicts,
    fetchConflicts,
    resolve,
  }
})
