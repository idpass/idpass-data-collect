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
const EXTERNAL_SYNC_URL = '/api/sync/external'
const GET_ENTITIES_COUNT_URL = '/api/sync/count-entities'
const USERS_URL = '/api/users'

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
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.get(APPS_URL, {
    params,
  })
  return response.data
}

export const getApp = async (id: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.get(`${APPS_URL}/${id}`)
  return response.data
}

export const createApp = async (formData: FormData) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.post(APPS_URL, formData)
  return response.data
}

export const updateApp = async (id: string, formData: FormData) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.put(`${APPS_URL}/${id}`, formData)
  return response.data
}

export const deleteApp = async (id: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.delete(`${APPS_URL}/${id}`)
  return response.data
}

export const getAppConfigJsonUrl = (artifactId: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  if (!artifactId) {
    throw new Error('Artifact id is required')
  }
  const baseUrl = API_URL.replace(/\/+$/, '')
  return `${baseUrl}/artifacts/${artifactId}.json`
}

export const getAppQrCodeUrl = (artifactId: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  if (!artifactId) {
    throw new Error('Artifact id is required')
  }
  const baseUrl = API_URL.replace(/\/+$/, '')
  return `${baseUrl}/artifacts/${artifactId}.png`
}

export const getEntitiesCount = async (configId: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.get(`${GET_ENTITIES_COUNT_URL}?configId=${configId}`)
  return response.data
}

export const externalSync = async (configId: string, credentials?: unknown) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.post(EXTERNAL_SYNC_URL, { configId, credentials })
  return response.data
}

export const getUsers = async (): Promise<{ id: string; email: string; role: string }[]> => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.get(USERS_URL)
  return response.data
}

export const createUser = async (user: { email: string; password: string; role: string }) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.post(USERS_URL, user)
  return response.data
}

export const updateUser = async (user: {
  id: string
  email: string
  password: string
  role: string
}) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.put(`${USERS_URL}/${user.id}`, user)
  return response.data
}

export const deleteUser = async (userId: string) => {
  if (!instance) {
    throw new Error('Instance not initialized')
  }
  const response = await instance.delete(`${USERS_URL}/${userId}`)
  return response.data
}
