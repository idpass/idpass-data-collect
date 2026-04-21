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
import { ref } from 'vue'
import { getApp, type AppConfig } from '@/api/apps'

export const useTenantStore = defineStore('tenant', () => {
  const currentConfig = ref<AppConfig | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadConfig(tenantId: string) {
    if (currentConfig.value?.id === tenantId) return
    loading.value = true
    error.value = null
    try {
      currentConfig.value = await getApp(tenantId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load tenant config'
      currentConfig.value = null
    } finally {
      loading.value = false
    }
  }

  function clearConfig() {
    currentConfig.value = null
    error.value = null
  }

  return {
    currentConfig,
    loading,
    error,
    loadConfig,
    clearConfig,
  }
})
