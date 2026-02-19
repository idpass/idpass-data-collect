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
import type { PortalRequest } from '@/types'

export interface RequestSearchParams {
  status?: string
  page?: number
  pageSize?: number
}

export interface RequestSearchResult {
  data: PortalRequest[]
  total: number
}

export async function searchRequests(params?: RequestSearchParams): Promise<RequestSearchResult> {
  const { data } = await api.get<RequestSearchResult>('/api/portal/requests', { params })
  return data
}

export async function getRequest(ref: string): Promise<PortalRequest> {
  const { data } = await api.get<PortalRequest>(`/api/portal/requests/${ref}`)
  return data
}

export async function updateRequest(
  ref: string,
  formData: Record<string, unknown>,
): Promise<PortalRequest> {
  const { data } = await api.put<PortalRequest>(`/api/portal/requests/${ref}`, { formData })
  return data
}

export async function submitRequest(ref: string): Promise<PortalRequest> {
  const { data } = await api.post<PortalRequest>(`/api/portal/requests/${ref}/submit`)
  return data
}

export async function resetRequest(ref: string): Promise<PortalRequest> {
  const { data } = await api.post<PortalRequest>(`/api/portal/requests/${ref}/reset`)
  return data
}
