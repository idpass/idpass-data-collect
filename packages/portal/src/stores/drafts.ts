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
import { ref, computed } from 'vue'
import { getDrafts, saveDraft, deleteDraft } from '@/api/drafts'
import type { PortalDraft } from '@/types'

export const useDraftsStore = defineStore('portalDrafts', () => {
  const drafts = ref<PortalDraft[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const draftsCount = computed(() => drafts.value.length)

  const draftsByType = computed<Record<string, PortalDraft[]>>(() => {
    return drafts.value.reduce<Record<string, PortalDraft[]>>((acc, draft) => {
      const type = draft.changeRequestType
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(draft)
      return acc
    }, {})
  })

  async function fetchDrafts(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      drafts.value = await getDrafts()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.drafts.loadFailed'
    } finally {
      isLoading.value = false
    }
  }

  async function saveDraftAction(
    id: string,
    changeRequestType: string,
    formData: Record<string, unknown>,
  ): Promise<PortalDraft> {
    error.value = null
    const saved = await saveDraft(id, changeRequestType, formData)
    const index = drafts.value.findIndex((d) => d.id === id)
    if (index !== -1) {
      drafts.value = [
        ...drafts.value.slice(0, index),
        saved,
        ...drafts.value.slice(index + 1),
      ]
    } else {
      drafts.value = [...drafts.value, saved]
    }
    return saved
  }

  async function removeDraft(id: string): Promise<void> {
    error.value = null
    await deleteDraft(id)
    drafts.value = drafts.value.filter((d) => d.id !== id)
  }

  return {
    drafts,
    isLoading,
    error,
    draftsCount,
    draftsByType,
    fetchDrafts,
    saveDraft: saveDraftAction,
    removeDraft,
  }
})
