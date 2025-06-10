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

import router from '@/router'
import axios from 'axios'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import get from 'lodash/get'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'

export const useAuthStore = defineStore('auth', () => {
  // State
  const tokens = ref<Record<string, string>>({})
  const userIds = ref<Record<string, string>>({})
  const fullSyncServerUrls = ref<Record<string, string>>({})

  // Actions

  const setSyncServerToken = (server: string, newToken: string | null) => {
    tokens.value[server] = newToken
    if (newToken) {
      localStorage.setItem(`syncServerToken_${server}`, newToken)
    } else {
      localStorage.removeItem(`syncServerToken_${server}`)
    }
  }

  const setSyncServerUserId = (server: string, newUserId: string | null) => {
    userIds.value[server] = newUserId
    if (newUserId) {
      localStorage.setItem(`syncServerUserId_${server}`, newUserId)
    } else {
      localStorage.removeItem(`syncServerUserId_${server}`)
    }
  }

  const setFullSyncServerUrl = (server: string, newUrl: string | null) => {
    fullSyncServerUrls.value[server] = newUrl
    if (newUrl) {
      localStorage.setItem(`fullSyncServerUrl_${server}`, newUrl)
    } else {
      localStorage.removeItem(`fullSyncServerUrl_${server}`)
    }
  }

  const loginSyncServer = async (
    server: string,
    credentials: { email: string; password: string }
  ) => {
    let res
    let fullSyncServerUrl
    try {
      // First try with HTTPS
      res = await axios.post('https://' + server + '/api/users/login', {
        email: credentials.email,
        password: credentials.password
      })
      fullSyncServerUrl = 'https://' + server
    } catch (error) {
      console.error('Try HTTPS failed', error)
      // If HTTPS fails, try with HTTP
      res = await axios.post('http://' + server + '/api/users/login', {
        email: credentials.email,
        password: credentials.password
      })
      fullSyncServerUrl = 'http://' + server
    }
    const token = get(res.data, 'token')
    const userId = get(res.data, 'userId')
    setSyncServerToken(server, token)
    setSyncServerUserId(server, userId)
    setFullSyncServerUrl(server, fullSyncServerUrl)
  }

  const logoutSyncServer = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    setSyncServerToken(server, null)
    setSyncServerUserId(server, null)
    setFullSyncServerUrl(server, null)
    router.push({ name: 'home', replace: true })
  }

  const getSyncServerAuth = async (appId: string) => {
    const server = await getSyncServerUrlByAppId(appId)
    let token = tokens.value[server]
    let userId = userIds.value[server]
    let fullSyncServerUrl = fullSyncServerUrls.value[server]

    console.log('getSyncServerAuth', appId, server, token, userId, fullSyncServerUrl)
    if (!token) {
      token = localStorage.getItem(`syncServerToken_${server}`)
      setSyncServerToken(server, token)
    }
    if (!userId) {
      userId = localStorage.getItem(`syncServerUserId_${server}`)
      setSyncServerUserId(server, userId)
    }
    if (!fullSyncServerUrl) {
      fullSyncServerUrl = localStorage.getItem(`fullSyncServerUrl_${server}`)
      setFullSyncServerUrl(server, fullSyncServerUrl)
    }
    return { token, userId, fullSyncServerUrl }
  }

  return {
    getSyncServerAuth,
    loginSyncServer,
    logoutSyncServer
  }
})
