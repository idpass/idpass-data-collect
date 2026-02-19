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
import { searchRequests, getRequest } from '@/api/requests'
import type { PortalRequest, RequestStatus } from '@/types'
import type { RequestSearchParams } from '@/api/requests'

export const useChangeRequestsStore = defineStore('portalChangeRequests', () => {
  const requests = ref<PortalRequest[]>([])
  const currentRequest = ref<PortalRequest | null>(null)
  const total = ref(0)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const requestsByStatus = computed<Record<RequestStatus, PortalRequest[]>>(() => {
    return requests.value.reduce<Record<RequestStatus, PortalRequest[]>>(
      (acc, request) => {
        const status = request.status
        if (!acc[status]) {
          acc[status] = []
        }
        acc[status].push(request)
        return acc
      },
      {} as Record<RequestStatus, PortalRequest[]>,
    )
  })

  async function fetchRequests(params?: RequestSearchParams): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const result = await searchRequests(params)
      requests.value = result.data
      total.value = result.total
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.requests.loadFailed'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchRequestDetail(ref: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      currentRequest.value = await getRequest(ref)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'errors.requests.loadDetailFailed'
    } finally {
      isLoading.value = false
    }
  }

  function clearCurrentRequest(): void {
    currentRequest.value = null
  }

  return {
    requests,
    currentRequest,
    total,
    isLoading,
    error,
    requestsByStatus,
    fetchRequests,
    fetchRequestDetail,
    clearCurrentRequest,
  }
})
