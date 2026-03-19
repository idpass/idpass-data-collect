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

import { getClient } from './client'

export interface SelfServiceEntity {
  entity: {
    guid: string
    data: Record<string, unknown>
    lastUpdated: string
  }
  availableForms: Array<{
    type: string
    label: string
    formio?: Record<string, unknown>
  }>
}

export interface SelfServiceSubmission {
  id: string
  submissionGuid: string
  tenantId: string
  status: 'pending' | 'approved' | 'rejected'
  submittedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  eventType: string
  entityGuid: string
  createdAt: string
}

export async function getSelfServiceEntity(): Promise<SelfServiceEntity> {
  const response = await getClient().get('/api/auth/self-service/entity')
  return response.data
}

export async function submitSelfServiceForm(params: {
  formType: string
  formData: Record<string, unknown>
}): Promise<{ review?: SelfServiceSubmission; status?: string }> {
  const response = await getClient().post('/api/auth/self-service/submit', params)
  return response.data
}

export async function getSelfServiceSubmissions(): Promise<{
  submissions: SelfServiceSubmission[]
}> {
  const response = await getClient().get('/api/auth/self-service/submissions')
  return response.data
}
