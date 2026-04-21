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

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

export interface AppConfig {
  id: string
  name: string
  description?: string
  entityForms: Array<{
    id: string
    name: string
    title: string
    formio: Record<string, unknown>
    dependsOn?: string
  }>
  [key: string]: unknown
}

async function apiRequest(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, ...fetchOptions } = options
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(`${BACKEND_URL}${path}`, { ...fetchOptions, headers })
}

export async function createAppConfig(
  token: string,
  config: AppConfig,
): Promise<void> {
  const blob = new Blob([JSON.stringify(config)], {
    type: 'application/json',
  })
  const formData = new FormData()
  formData.append('config', blob, 'config.json')

  const res = await apiRequest('/api/apps', {
    method: 'POST',
    token,
    body: formData,
  })
  if (!res.ok && res.status !== 201) {
    throw new Error(`Failed to create app config: ${res.status} ${await res.text()}`)
  }
}

export async function deleteAppConfig(
  token: string,
  configId: string,
): Promise<void> {
  const res = await apiRequest(`/api/apps/${configId}`, {
    method: 'DELETE',
    token,
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete app config: ${res.status}`)
  }
}

export async function getAppConfig(
  token: string,
  configId: string,
): Promise<unknown> {
  const res = await apiRequest(`/api/apps/${configId}`, { token })
  if (!res.ok) return null
  return res.json()
}

export async function createUser(
  token: string,
  email: string,
  password: string,
  role: 'ADMIN' | 'USER',
  tenantIds?: string[],
): Promise<void> {
  const body: Record<string, unknown> = { email, password, role }
  if (tenantIds) body.tenantIds = tenantIds

  const res = await apiRequest('/api/users', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create user: ${res.status} ${await res.text()}`)
  }
}

export async function pushEvents(
  token: string,
  configId: string,
  events: Array<{
    guid: string
    entityGuid: string
    type: string
    data: Record<string, unknown>
    timestamp: string
    userId: string
    syncLevel: number
  }>,
): Promise<void> {
  const res = await apiRequest('/api/sync/push', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configId, events }),
  })
  if (!res.ok) {
    throw new Error(`Failed to push events: ${res.status} ${await res.text()}`)
  }
}

export async function getEntityCount(
  token: string,
  configId: string,
): Promise<number> {
  const res = await apiRequest(
    `/api/entities/count?configId=${configId}`,
    { token },
  )
  if (!res.ok) {
    throw new Error(`Failed to get entity count: ${res.status}`)
  }
  const data = await res.json()
  return typeof data === 'number' ? data : data.count ?? 0
}

export async function getEntities(
  token: string,
  configId: string,
): Promise<unknown[]> {
  const res = await apiRequest(
    `/api/entities?configId=${configId}`,
    { token },
  )
  if (!res.ok) {
    throw new Error(`Failed to get entities: ${res.status}`)
  }
  return res.json()
}

export { BACKEND_URL }
