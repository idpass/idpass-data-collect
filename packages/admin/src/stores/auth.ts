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
import { ref, computed } from 'vue'
import axios from 'axios'
import router from '@/router'

const API_URL = import.meta.env.VITE_API_URL
const LOGIN_URL = `${API_URL}/api/users/login`
const REFRESH_URL = `${API_URL}/api/users/refresh`

/** Refresh interval: 45 minutes (token lifetime is 1h) */
const REFRESH_INTERVAL_MS = 45 * 60 * 1000

interface JwtPayload {
  id: string
  email: string
  role?: string
  tenantIds?: string[]
  roleAssignments?: Array<{ tenantId: string; role: string; areaId?: string }>
  exp?: number
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem('token'))
  const decodedPayload = ref<JwtPayload | null>(
    token.value ? decodeJwtPayload(token.value) : null,
  )
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  // Computed
  const isAuthenticated = computed(() => !!token.value)
  const userRole = computed(() => decodedPayload.value?.role ?? null)
  const userTenantIds = computed(() => decodedPayload.value?.tenantIds ?? [])
  const isAdmin = computed(() => decodedPayload.value?.role === 'ADMIN')

  const hasPermission = (action: string): boolean => {
    if (isAdmin.value) return true
    // Non-admin users can only read by default
    return action === 'read'
  }

  // Actions
  const startRefreshTimer = () => {
    stopRefreshTimer()
    refreshTimer = setInterval(async () => {
      try {
        const response = await axios.post(REFRESH_URL, null, {
          headers: { Authorization: `Bearer ${token.value}` },
        })
        setToken(response.data.token)
      } catch {
        // If refresh fails, the 401 interceptor will handle logout
      }
    }, REFRESH_INTERVAL_MS)
  }

  const stopRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  const setToken = (newToken: string | null) => {
    token.value = newToken
    if (newToken) {
      localStorage.setItem('token', newToken)
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      decodedPayload.value = decodeJwtPayload(newToken)
    } else {
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization']
      decodedPayload.value = null
    }
  }

  const login = async (credentials: { email: string; password: string }) => {
    try {
      const response = await axios.post(LOGIN_URL, credentials)
      const { token: newToken } = response.data
      setToken(newToken)
      startRefreshTimer()
      router.push('/')
      return true
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  const logout = () => {
    stopRefreshTimer()
    setToken(null)
    router.push('/login')
  }

  const initializeAuth = () => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      // Check if token is expired
      if (decodedPayload.value?.exp) {
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (decodedPayload.value.exp <= nowSeconds) {
          logout()
          return
        }
      }
      startRefreshTimer()
    }
  }

  return {
    token,
    isAuthenticated,
    userRole,
    userTenantIds,
    isAdmin,
    hasPermission,
    login,
    logout,
    initializeAuth,
  }
})
