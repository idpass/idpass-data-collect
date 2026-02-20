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
import { loginAgent, refreshToken } from '@/api/auth'

const REFRESH_INTERVAL_MS = 45 * 60 * 1000

interface AgentPayload {
  id: string
  email: string
  role?: string
  tenantIds?: string[]
  roleAssignments?: Array<{ tenantId: string; role: string; areaId?: string }>
  exp?: number
}

interface CitizenPayload {
  scope: 'self-service'
  identifier: string
  entityGuid?: string
  tenantId: string
  exp?: number
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const userType = ref<'agent' | 'citizen' | null>(null)
  const token = ref<string | null>(null)
  const agentPayload = ref<AgentPayload | null>(null)
  const citizenPayload = ref<CitizenPayload | null>(null)
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  const isAuthenticated = computed(() => !!token.value)
  const isAgent = computed(() => userType.value === 'agent')
  const isCitizen = computed(() => userType.value === 'citizen')
  const isAdmin = computed(() => agentPayload.value?.role === 'ADMIN')

  function setAgentToken(newToken: string) {
    const payload = decodeJwtPayload(newToken) as AgentPayload | null
    if (!payload) return

    userType.value = 'agent'
    token.value = newToken
    agentPayload.value = payload
    citizenPayload.value = null
    localStorage.setItem('web_token', newToken)
    localStorage.setItem('web_user_type', 'agent')
  }

  function setCitizenToken(newToken: string) {
    const payload = decodeJwtPayload(newToken) as CitizenPayload | null
    if (!payload) return

    userType.value = 'citizen'
    token.value = newToken
    citizenPayload.value = payload
    agentPayload.value = null
    sessionStorage.setItem('web_citizen_token', newToken)
    sessionStorage.setItem('web_user_type', 'citizen')
  }

  function startRefreshTimer() {
    stopRefreshTimer()
    if (userType.value !== 'agent') return

    refreshTimer = setInterval(async () => {
      try {
        const result = await refreshToken()
        setAgentToken(result.token)
      } catch {
        // 401 interceptor handles logout
      }
    }, REFRESH_INTERVAL_MS)
  }

  function stopRefreshTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  async function loginAsAgent(credentials: { email: string; password: string }): Promise<boolean> {
    try {
      const result = await loginAgent(credentials)
      setAgentToken(result.token)
      startRefreshTimer()
      return true
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  function loginAsCitizen(jwtToken: string) {
    setCitizenToken(jwtToken)
  }

  function logout() {
    stopRefreshTimer()
    userType.value = null
    token.value = null
    agentPayload.value = null
    citizenPayload.value = null
    localStorage.removeItem('web_token')
    localStorage.removeItem('web_user_type')
    sessionStorage.removeItem('web_citizen_token')
    sessionStorage.removeItem('web_user_type')
  }

  function initializeAuth() {
    // Check agent auth (localStorage)
    const storedAgentToken = localStorage.getItem('web_token')
    const storedType = localStorage.getItem('web_user_type')
    if (storedAgentToken && storedType === 'agent') {
      const payload = decodeJwtPayload(storedAgentToken) as AgentPayload | null
      if (payload?.exp) {
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (payload.exp <= nowSeconds) {
          logout()
          return
        }
      }
      setAgentToken(storedAgentToken)
      startRefreshTimer()
      return
    }

    // Check citizen auth (sessionStorage)
    const storedCitizenToken = sessionStorage.getItem('web_citizen_token')
    const storedCitizenType = sessionStorage.getItem('web_user_type')
    if (storedCitizenToken && storedCitizenType === 'citizen') {
      const payload = decodeJwtPayload(storedCitizenToken) as CitizenPayload | null
      if (payload?.exp) {
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (payload.exp <= nowSeconds) {
          logout()
          return
        }
      }
      setCitizenToken(storedCitizenToken)
    }
  }

  return {
    userType,
    token,
    agentPayload,
    citizenPayload,
    isAuthenticated,
    isAgent,
    isCitizen,
    isAdmin,
    loginAsAgent,
    loginAsCitizen,
    logout,
    initializeAuth,
  }
})
