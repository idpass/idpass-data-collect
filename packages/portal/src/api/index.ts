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

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'

const MAX_RETRIES = 2
const RETRY_DELAYS_MS = [1000, 2000]

// Extend AxiosRequestConfig to track retry state
interface RetryableRequestConfig extends AxiosRequestConfig {
  _retryCount?: number
}

let instance: AxiosInstance | null = null
// Guard to prevent multiple simultaneous sign-out calls
let isSigningOut = false

export function initializeApi(): void {
  if (instance) {
    return
  }

  const authStore = useAuthStore()

  instance = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    timeout: 30000,
  })

  instance.interceptors.request.use(
    (config) => {
      const token = authStore.getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    },
  )

  // Retry interceptor for network errors and 5xx responses (GET only)
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as RetryableRequestConfig

      const isGetRequest = config?.method?.toLowerCase() === 'get'
      const isNetworkError = !error.response
      const isServerError = error.response?.status >= 500

      const shouldRetry = isGetRequest && (isNetworkError || isServerError)

      const retryCount = config?._retryCount ?? 0

      if (shouldRetry && retryCount < MAX_RETRIES) {
        config._retryCount = retryCount + 1
        const delay = RETRY_DELAYS_MS[retryCount] ?? 1000

        await new Promise<void>((resolve) => setTimeout(resolve, delay))
        return instance!(config)
      }

      return Promise.reject(error)
    },
  )

  // 401 response interceptor — signs out the user
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        const requestUrl = error.config?.url ?? ''
        const isCallbackPath = requestUrl.includes('/callback')

        if (!isCallbackPath && !isSigningOut) {
          isSigningOut = true
          authStore.signOut().finally(() => {
            isSigningOut = false
          })
        }
      }
      return Promise.reject(error)
    },
  )
}

export function getApiInstance(): AxiosInstance {
  if (!instance) {
    throw new Error('API not initialized. Call initializeApi() first.')
  }
  return instance
}

export default {
  get: <T>(url: string, config?: Parameters<AxiosInstance['get']>[1]) => {
    return getApiInstance().get<T>(url, config)
  },
  post: <T>(url: string, data?: unknown, config?: Parameters<AxiosInstance['post']>[2]) => {
    return getApiInstance().post<T>(url, data, config)
  },
  put: <T>(url: string, data?: unknown, config?: Parameters<AxiosInstance['put']>[2]) => {
    return getApiInstance().put<T>(url, data, config)
  },
  patch: <T>(url: string, data?: unknown, config?: Parameters<AxiosInstance['patch']>[2]) => {
    return getApiInstance().patch<T>(url, data, config)
  },
  delete: <T>(url: string, config?: Parameters<AxiosInstance['delete']>[1]) => {
    return getApiInstance().delete<T>(url, config)
  },
}
