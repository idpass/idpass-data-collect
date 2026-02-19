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
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { EntityDataManager } from '@idpass/data-collect-core'
import { store } from '@/store/index'

type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'
type AttendanceMode = 'check-in' | 'roll-call'

const DRAFT_KEY_PREFIX = 'attendance-draft-'

export const useAttendanceStore = defineStore('attendance', () => {
  const currentSessionId = ref<string | null>(null)
  const currentGroupGuid = ref<string | null>(null)
  const sessionName = ref<string>('')
  const mode = ref<AttendanceMode>('check-in')
  const memberStatuses = ref<Map<string, AttendanceStatus>>(new Map())
  const checkInOrder = ref<string[]>([])
  const savedCount = ref<number>(0)
  const totalToSave = ref<number>(0)
  const lastAutoSave = ref<string | null>(null)
  const isDirty = ref<boolean>(false)

  const autoSaveDraft = () => {
    if (!currentSessionId.value) return
    const draft = {
      currentSessionId: currentSessionId.value,
      currentGroupGuid: currentGroupGuid.value,
      sessionName: sessionName.value,
      mode: mode.value,
      memberStatuses: Object.fromEntries(memberStatuses.value),
      checkInOrder: checkInOrder.value,
      savedCount: savedCount.value,
      totalToSave: totalToSave.value,
    }
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${currentSessionId.value}`, JSON.stringify(draft))
    lastAutoSave.value = new Date().toISOString()
  }

  const startSession = async (
    sessionMode: AttendanceMode,
    groupGuid?: string,
    name?: string,
  ) => {
    currentSessionId.value = uuidv4()
    mode.value = sessionMode
    currentGroupGuid.value = groupGuid || null
    sessionName.value = name || ''
    memberStatuses.value = new Map()
    checkInOrder.value = []
    savedCount.value = 0
    totalToSave.value = 0
    lastAutoSave.value = null
    isDirty.value = false

    if (sessionMode === 'roll-call' && groupGuid && store) {
      try {
        const members = await store.getMembers(groupGuid)
        for (const { modified } of members) {
          if (modified?.guid) {
            memberStatuses.value.set(modified.guid, 'present')
          }
        }
      } catch {
        // If group loading fails, continue with empty members
      }
    }
  }

  const setMemberStatus = (entityGuid: string, status: AttendanceStatus) => {
    memberStatuses.value.set(entityGuid, status)
    isDirty.value = true
    autoSaveDraft()
  }

  const addCheckIn = (entityGuid: string) => {
    checkInOrder.value = [entityGuid, ...checkInOrder.value.filter((g) => g !== entityGuid)]
    memberStatuses.value.set(entityGuid, 'present')
    autoSaveDraft()
  }

  const removeCheckIn = (entityGuid: string) => {
    checkInOrder.value = checkInOrder.value.filter((g) => g !== entityGuid)
    memberStatuses.value.delete(entityGuid)
  }

  const loadDraft = (sessionId: string) => {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${sessionId}`)
    if (!raw) return
    let draft
    try {
      draft = JSON.parse(raw)
    } catch {
      // Malformed draft data in localStorage — discard it silently
      return
    }
    currentSessionId.value = draft.currentSessionId
    currentGroupGuid.value = draft.currentGroupGuid
    sessionName.value = draft.sessionName || ''
    mode.value = draft.mode
    memberStatuses.value = new Map(Object.entries(draft.memberStatuses || {}))
    checkInOrder.value = draft.checkInOrder || []
    savedCount.value = draft.savedCount || 0
    totalToSave.value = draft.totalToSave || 0
    isDirty.value = false
  }

  const discardDraft = (sessionId: string) => {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${sessionId}`)
  }

  const getAllPendingDrafts = (): Array<{ sessionId: string; sessionName: string; count: number }> => {
    const drafts: Array<{ sessionId: string; sessionName: string; count: number }> = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(DRAFT_KEY_PREFIX)) {
        const raw = localStorage.getItem(key)
        if (raw) {
          try {
            const draft = JSON.parse(raw)
            drafts.push({
              sessionId: draft.currentSessionId,
              sessionName: draft.sessionName || '',
              count: draft.memberStatuses ? Object.keys(draft.memberStatuses).length : 0,
            })
          } catch {
            // Malformed draft data in localStorage — skip this entry
          }
        }
      }
    }
    return drafts
  }

  const discardAllDrafts = () => {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(DRAFT_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  }

  // Returns the first pending draft for backwards compatibility.
  // Use getAllPendingDrafts() to retrieve all drafts.
  const hasPendingDraft = (): { sessionId: string; sessionName: string; count: number } | null => {
    return getAllPendingDrafts()[0] || null
  }

  const submitSession = async (entityStore: EntityDataManager, userId: string) => {
    const guids = Array.from(memberStatuses.value.keys())
    totalToSave.value = guids.length
    savedCount.value = 0

    for (const memberGuid of guids) {
      await entityStore.submitForm({
        guid: uuidv4(),
        entityGuid: memberGuid,
        type: 'record-attendance',
        data: {
          sessionId: currentSessionId.value,
          sessionName: sessionName.value,
          mode: mode.value,
          groupGuid: currentGroupGuid.value || undefined,
          date: new Date().toISOString().slice(0, 10),
          status: memberStatuses.value.get(memberGuid),
        },
        timestamp: new Date().toISOString(),
        userId,
        syncLevel: 0,
      })
      savedCount.value++
    }

    if (currentSessionId.value) {
      discardDraft(currentSessionId.value)
    }
  }

  const resetSession = () => {
    currentSessionId.value = null
    currentGroupGuid.value = null
    sessionName.value = ''
    mode.value = 'check-in'
    memberStatuses.value = new Map()
    checkInOrder.value = []
    savedCount.value = 0
    totalToSave.value = 0
    lastAutoSave.value = null
    isDirty.value = false
  }

  return {
    currentSessionId,
    currentGroupGuid,
    sessionName,
    mode,
    memberStatuses,
    checkInOrder,
    savedCount,
    totalToSave,
    lastAutoSave,
    isDirty,
    startSession,
    setMemberStatus,
    addCheckIn,
    removeCheckIn,
    autoSaveDraft,
    loadDraft,
    discardDraft,
    getAllPendingDrafts,
    discardAllDrafts,
    hasPendingDraft,
    submitSession,
    resetSession,
  }
})
