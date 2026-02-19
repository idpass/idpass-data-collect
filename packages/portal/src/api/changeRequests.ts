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
import type { RequestType, PortalRequest } from '@/types'

export interface FormSchemaResponse {
  formioSchema: Record<string, unknown>
  schemaChanged: boolean
}

export async function getRequestTypes(): Promise<RequestType[]> {
  const { data } = await api.get<RequestType[]>('/api/portal/requests/types')
  return data
}

export async function getRequestTypeForm(typeCode: string): Promise<FormSchemaResponse> {
  const { data } = await api.get<FormSchemaResponse>(
    `/api/portal/requests/types/${typeCode}/form`,
  )
  return data
}

export async function createRequest(
  type: string,
  formData: Record<string, unknown>,
  submit: boolean = false,
): Promise<PortalRequest> {
  const { data } = await api.post<PortalRequest>('/api/portal/requests', {
    type,
    formData,
    submit,
  })
  return data
}
