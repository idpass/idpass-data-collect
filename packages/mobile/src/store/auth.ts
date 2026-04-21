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

import axios from 'axios'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import get from 'lodash/get'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { SecureStorageService } from '@/services/SecureStorageService'

export const useAuthStore = defineStore('auth', () => {
  // In-memory cache — reads from secure storage only on cache miss
  const tokens = ref<Record<string, string>>({})
  const userIds = ref<Record<string, string>>({})
  const fullSyncServerUrls = ref<Record<string, string>>({})

  const setSyncServerToken = async (server: string, newToken: string | null) => {
    tokens.value[server] = newToken
    if (newToken) {
      await SecureStorageService.set(`syncServerToken_${server}`, newToken)
    } else {
      await SecureStorageService.remove(`syncServerToken_${server}`)
    }
  }

  const setSyncServerUserId = async (server: string, newUserId: string | null) => {
    userIds.value[server] = newUserId
    if (newUserId) {
      await SecureStorageService.set(`syncServerUserId_${server}`, newUserId)
    } else {
      await SecureStorageService.remove(`syncServerUserId_${server}`)
    }
  }

  const setFullSyncServerUrl = async (server: string, newUrl: string | null) => {
    fullSyncServerUrls.value[server] = newUrl
    if (newUrl) {
      await SecureStorageService.set(`fullSyncServerUrl_${server}`, newUrl)
    } else {
      await SecureStorageService.remove(`fullSyncServerUrl_${server}`)
    }
  }

  const loginSyncServer = async (
    server: string,
    credentials: { email: string; password: string }
  ) => {
    // Preserve explicit scheme if provided; otherwise default to HTTPS
    let fullSyncServerUrl: string
    if (server.startsWith('http://') || server.startsWith('https://')) {
      fullSyncServerUrl = server
    } else {
      fullSyncServerUrl = `https://${server}`
    }

    const res = await axios.post(`${fullSyncServerUrl}/api/users/login`, {
      email: credentials.email,
      password: credentials.password
    })

    const token = get(res.data, 'token')
    const userId = get(res.data, 'userId')
    await setSyncServerToken(server, token)
    await setSyncServerUserId(server, userId)
    await setFullSyncServerUrl(server, fullSyncServerUrl)
    // Store a fixed-key token for the replication handler which does not know
    // which server URL to key on at push time
    await SecureStorageService.set('replication_auth_token', token)
  }

  const logoutSyncServer = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    await setSyncServerToken(server, null)
    await setSyncServerUserId(server, null)
    await setFullSyncServerUrl(server, null)
    await SecureStorageService.remove('replication_auth_token')
  }

  const getSyncServerAuth = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    let token = tokens.value[server]
    let userId = userIds.value[server]
    let fullSyncServerUrl = fullSyncServerUrls.value[server]

    if (!token) {
      token = await SecureStorageService.get(`syncServerToken_${server}`)
      await setSyncServerToken(server, token)
    }
    if (!userId) {
      userId = await SecureStorageService.get(`syncServerUserId_${server}`)
      await setSyncServerUserId(server, userId)
    }
    if (!fullSyncServerUrl) {
      fullSyncServerUrl = await SecureStorageService.get(`fullSyncServerUrl_${server}`)
      await setFullSyncServerUrl(server, fullSyncServerUrl)
    }
    return { token, userId, fullSyncServerUrl }
  }

  return {
    getSyncServerAuth,
    loginSyncServer,
    logoutSyncServer
  }
})
