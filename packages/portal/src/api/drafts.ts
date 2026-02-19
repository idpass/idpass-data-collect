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

import api from './index'
import type { PortalDraft } from '@/types'

export async function getDrafts(): Promise<PortalDraft[]> {
  const { data } = await api.get<PortalDraft[]>('/api/portal/drafts')
  return data
}

export async function saveDraft(
  id: string,
  changeRequestType: string,
  formData: Record<string, unknown>,
): Promise<PortalDraft> {
  const { data } = await api.put<PortalDraft>(`/api/portal/drafts/${id}`, {
    changeRequestType,
    formData,
  })
  return data
}

export async function deleteDraft(id: string): Promise<void> {
  await api.delete(`/api/portal/drafts/${id}`)
}
