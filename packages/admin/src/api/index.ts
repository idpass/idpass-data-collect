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

import { useAuthStore } from '@/stores/auth'
import axios, { type AxiosInstance } from 'axios'

const API_URL = import.meta.env.VITE_API_URL
const APPS_URL = '/api/apps'
const ENTITIES_URL = '/api/entities'
const EXTERNAL_SYNC_URL = '/api/sync/external'
const USERS_URL = '/api/users'
const REVIEWS_URL = '/api/reviews'
const DUPLICATES_URL = '/api/potential-duplicates'
const ATTACHMENTS_URL = '/api/attachments'

export let instance: AxiosInstance | null = null

export const initializeInstance = () => {
  if (instance) {
    return
  }
  const authStore = useAuthStore()
  instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
  })

  instance.interceptors.request.use(
    (config) => {
      if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`
      }
      return config
    },

    (error) => {
      return Promise.reject(error)
    },
  )

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response.status === 401) {
        authStore.logout()
      }
      return Promise.reject(error)
    },
  )
}

function api(): AxiosInstance {
  if (!instance) throw new Error('Instance not initialized')
  return instance
}

export interface AppListParams {
  page?: number
  pageSize?: number
  sortBy?: 'name' | 'id' | 'entitiesCount'
  sortOrder?: 'asc' | 'desc'
  search?: string
}

export interface AppListItem {
  id: string
  artifactId: string
  name: string
  version: string
  entitiesCount: number
  externalSync: Record<string, string>
  description: string
}

export interface AppListMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: string
  sortOrder: string
  search: string
}

export interface AppListResponse {
  data: AppListItem[]
  meta: AppListMeta
}

export const getApps = async (params: AppListParams = {}): Promise<AppListResponse> => {
  const response = await api().get(APPS_URL, {
    params,
  })
  return response.data
}

export const getApp = async (id: string) => {
  const response = await api().get(`${APPS_URL}/${id}`)
  return response.data
}

export const createApp = async (formData: FormData) => {
  const response = await api().post(APPS_URL, formData)
  return response.data
}

export const updateApp = async (id: string, formData: FormData) => {
  const response = await api().put(`${APPS_URL}/${id}`, formData)
  return response.data
}

export const deleteApp = async (id: string) => {
  const response = await api().delete(`${APPS_URL}/${id}`)
  return response.data
}

export const getAppConfigJsonUrl = (artifactId: string) => {
  api() // ensure initialized
  if (!artifactId) {
    throw new Error('Artifact id is required')
  }
  const baseUrl = API_URL.replace(/\/+$/, '')
  return `${baseUrl}/artifacts/${artifactId}.json`
}

export const getAppQrCodeUrl = (artifactId: string) => {
  api() // ensure initialized
  if (!artifactId) {
    throw new Error('Artifact id is required')
  }
  const baseUrl = API_URL.replace(/\/+$/, '')
  return `${baseUrl}/artifacts/${artifactId}.png`
}

export const getEntitiesCount = async (configId: string) => {
  const response = await api().get(`${ENTITIES_URL}/count?configId=${configId}`)
  return response.data
}

export const getEntitiesCountByForm = async (configId: string): Promise<Record<string, number>> => {
  const response = await api().get(`${ENTITIES_URL}/count-by-form?configId=${configId}`)
  return response.data
}

export interface EntityRecord {
  guid: string
  id: string
  name?: string
  entityName?: string
  type: string
  data: Record<string, unknown>
  memberIds?: string[]
  lastUpdated: string
}

export const getEntities = async (configId: string, limit = 100): Promise<EntityRecord[]> => {
  const response = await api().get(`${ENTITIES_URL}?configId=${configId}&limit=${limit}`)
  return response.data
}

export interface EventRecord {
  guid: string
  entityGuid: string
  type: string
  data: Record<string, unknown>
  timestamp: string
  userId: string
  syncLevel: number
}

export const getEntityEvents = async (entityGuid: string, configId: string): Promise<EventRecord[]> => {
  const response = await api().get(`${ENTITIES_URL}/${entityGuid}/events?configId=${configId}`)
  return response.data
}

export const externalSync = async (configId: string, credentials?: unknown) => {
  const response = await api().post(EXTERNAL_SYNC_URL, { configId, credentials })
  return response.data
}

export const getUsers = async (): Promise<{ id: string; email: string; role: string }[]> => {
  const response = await api().get(USERS_URL)
  return response.data
}

export const createUser = async (user: { email: string; password: string; role: string; tenantIds?: string[] }) => {
  const response = await api().post(USERS_URL, user)
  return response.data
}

export const updateUser = async (user: {
  id: string
  email: string
  password?: string
  role: string
  tenantIds?: string[]
}) => {
  const response = await api().put(`${USERS_URL}/${user.id}`, user)
  return response.data
}

export const deleteUser = async (userId: string) => {
  const response = await api().delete(`${USERS_URL}/${userId}`)
  return response.data
}

// OpenSPP Field Mapping APIs
const OPENSPP_FIELDS_URL = '/api/openspp-fields'

export interface ParsedOpenSppField {
  name: string
  type: 'text' | 'date' | 'relation' | 'selection'
  label?: string
  required?: boolean
  options?: Array<{ id: number | string; label: string }>
}

export interface FieldMapping {
  formField: string
  opensppField: string
  transformer: {
    type: 'text' | 'date' | 'id' | 'multiselect' | 'boolean'
    options?: {
      // Date transformer options
      inputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'auto'
      outputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY'
      // Multi-select transformer options
      delimiter?: string
      // Boolean transformer options
      truthyValue?: string
      falsyValue?: string
    }
  }
}

export const parseOpenSppFieldsFromFile = async (file: File): Promise<{ fields: ParsedOpenSppField[] }> => {
  const formData = new FormData()
  formData.append('payload', file)
  const response = await api().post(`${OPENSPP_FIELDS_URL}/parse-file`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export const parseOpenSppFieldsFromPayload = async (payload: unknown): Promise<{ fields: ParsedOpenSppField[] }> => {
  const response = await api().post(`${OPENSPP_FIELDS_URL}/parse`, payload)
  return response.data
}

export interface FetchOpenSppFieldsParams {
  url: string
  database: string
  username: string
  password: string
  model?: string
  fields?: string[]
  attributes?: string[]
}

export const fetchOpenSppFieldsFromAPI = async (params: FetchOpenSppFieldsParams): Promise<{ fields: ParsedOpenSppField[] }> => {
  const response = await api().post(`${OPENSPP_FIELDS_URL}/fetch`, params)
  return response.data
}

// --- Reviews ---

export interface ReviewFormData {
  guid: string
  entityGuid: string
  type: string
  data: Record<string, unknown>
  timestamp: string
  userId: string
  syncLevel: number
}

export interface ReviewRecord {
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
  formData: ReviewFormData
  createdAt: string
}

export interface ReviewConfigRecord {
  eventType: string
  policy: 'auto-approve' | 'internal-review' | 'external-delegate'
  requiredRole?: string
  externalAdapterType?: string
}

export const getReviews = async (
  tenantId: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<{ reviews: ReviewRecord[] }> => {
  const params: Record<string, string> = { tenantId }
  if (status) {
    params.status = status
  }
  const response = await api().get(REVIEWS_URL, { params })
  return response.data
}

export const approveReview = async (
  id: string,
  tenantId: string,
): Promise<{ review: ReviewRecord }> => {
  const response = await api().post(`${REVIEWS_URL}/${id}/approve`, { tenantId })
  return response.data
}

export const rejectReview = async (
  id: string,
  tenantId: string,
  reason: string,
): Promise<{ review: ReviewRecord }> => {
  const response = await api().post(`${REVIEWS_URL}/${id}/reject`, { tenantId, reason })
  return response.data
}

export const bulkApproveReviews = async (
  reviewIds: string[],
  tenantId: string,
): Promise<{ approved: number; failed: number; errors: Array<{ reviewId: string; error: string }> }> => {
  const response = await api().post(`${REVIEWS_URL}/bulk-approve`, { reviewIds, tenantId })
  return response.data
}

export const getReviewConfigs = async (
  tenantId: string,
): Promise<{ configs: ReviewConfigRecord[] }> => {
  const response = await api().get(`${REVIEWS_URL}/config/${tenantId}`)
  return response.data
}

export const setReviewConfig = async (
  tenantId: string,
  eventType: string,
  config: { policy: string; requiredRole?: string; externalAdapterType?: string },
): Promise<{ status: string; config: ReviewConfigRecord }> => {
  const response = await api().put(`${REVIEWS_URL}/config/${tenantId}/${eventType}`, config)
  return response.data
}

// --- Potential Duplicates ---

export interface PotentialDuplicate {
  entityGuid: string
  duplicateGuid: string
}

export const getPotentialDuplicates = async (
  configId: string,
): Promise<PotentialDuplicate[]> => {
  const response = await api().get(DUPLICATES_URL, { params: { configId } })
  return response.data
}

export const resolveDuplicate = async (params: {
  newItem: string
  existingItem: string
  shouldDeleteNewItem: boolean
  configId: string
}): Promise<{ status: string }> => {
  const response = await api().post(`${DUPLICATES_URL}/resolve`, params)
  return response.data
}

// --- Attachments ---

export interface AttachmentMetadata {
  guid: string
  entityGuid: string
  filename: string
  mimeType: string
  sizeBytes: number
  tenantId: string
}

export const uploadAttachment = async (
  file: File,
  entityGuid: string,
  configId: string,
): Promise<{ status: string; attachment: AttachmentMetadata }> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('entityGuid', entityGuid)
  formData.append('configId', configId)
  const response = await api().post(`${ATTACHMENTS_URL}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const getEntityAttachments = async (
  entityGuid: string,
  configId: string,
): Promise<{ status: string; attachments: AttachmentMetadata[] }> => {
  const response = await api().get(`${ATTACHMENTS_URL}/entity/${entityGuid}`, {
    params: { configId },
  })
  return response.data
}

export const deleteAttachment = async (
  guid: string,
  configId: string,
): Promise<{ status: string }> => {
  const response = await api().delete(`${ATTACHMENTS_URL}/${guid}`, {
    params: { configId },
  })
  return response.data
}

export const getAttachmentDownloadUrl = (guid: string, configId: string): string => {
  const baseUrl = API_URL.replace(/\/+$/, '')
  return `${baseUrl}${ATTACHMENTS_URL}/${guid}?configId=${configId}`
}

// --- User Token Management ---

export const refreshToken = async (): Promise<{ token: string; userId: string }> => {
  const response = await api().post(`${USERS_URL}/refresh`)
  return response.data
}

export const getCurrentUser = async (): Promise<{
  id: string
  email: string
  role: string
  tenantIds: string[]
  roleAssignments?: Array<{ tenantId: string; role: string; areaId?: string }>
}> => {
  const response = await api().get(`${USERS_URL}/me`)
  return response.data
}
