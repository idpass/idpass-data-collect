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

import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useAuthStore } from '@/stores/auth'
import { getClient } from '@/api/client'

export interface FormSubmission {
  guid: string
  entityGuid: string
  type: string
  data: Record<string, unknown>
  timestamp: string
  userId: string
  syncLevel: number
}

export function useFormRenderer() {
  const submitting = ref(false)
  const submitError = ref<string | null>(null)

  async function submitForm(params: {
    tenantId: string
    entityGuid: string | null
    formType: string
    formData: Record<string, unknown>
  }): Promise<{ success: boolean; submissionGuid?: string }> {
    submitting.value = true
    submitError.value = null

    const authStore = useAuthStore()
    const userId = authStore.agentPayload?.email || authStore.agentPayload?.id || 'unknown'

    const submission: FormSubmission = {
      guid: uuidv4(),
      entityGuid: params.entityGuid || uuidv4(),
      type: params.formType,
      data: params.formData,
      timestamp: new Date().toISOString(),
      userId,
      syncLevel: 1, // SYNCED
    }

    try {
      await getClient().post('/api/reviews/submit', {
        tenantId: params.tenantId,
        formData: submission,
      })
      return { success: true, submissionGuid: submission.guid }
    } catch (error) {
      submitError.value = error instanceof Error ? error.message : 'Submission failed'
      return { success: false }
    } finally {
      submitting.value = false
    }
  }

  return {
    submitting,
    submitError,
    submitForm,
  }
}
