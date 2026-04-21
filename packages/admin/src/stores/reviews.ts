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
import {
  getReviews as getReviewsApi,
  approveReview as approveReviewApi,
  rejectReview as rejectReviewApi,
  bulkApproveReviews as bulkApproveApi,
  getReviewConfigs as getReviewConfigsApi,
  setReviewConfig as setReviewConfigApi,
} from '@/api'
import type { ReviewRecord, ReviewConfigRecord } from '@/api'

export const useReviewsStore = defineStore('reviews', () => {
  // State
  const reviews = ref<ReviewRecord[]>([])
  const reviewConfigs = ref<ReviewConfigRecord[]>([])
  const loading = ref(false)
  const selectedTenantId = ref<string | null>(null)
  const statusFilter = ref<'pending' | 'approved' | 'rejected' | null>(null)

  // Computed
  const pendingCount = computed(() => reviews.value.filter((r) => r.status === 'pending').length)

  const filteredReviews = computed(() => {
    if (!statusFilter.value) {
      return reviews.value
    }
    return reviews.value.filter((r) => r.status === statusFilter.value)
  })

  // Actions
  const fetchReviews = async (tenantId: string, status?: 'pending' | 'approved' | 'rejected') => {
    loading.value = true
    try {
      selectedTenantId.value = tenantId
      statusFilter.value = status ?? null
      const response = await getReviewsApi(tenantId, status)
      reviews.value = response.reviews
    } finally {
      loading.value = false
    }
  }

  const approve = async (id: string) => {
    if (!selectedTenantId.value) return
    const response = await approveReviewApi(id, selectedTenantId.value)
    const index = reviews.value.findIndex((r) => r.id === id)
    if (index !== -1) {
      reviews.value[index] = response.review
    }
  }

  const reject = async (id: string, reason: string) => {
    if (!selectedTenantId.value) return
    const response = await rejectReviewApi(id, selectedTenantId.value, reason)
    const index = reviews.value.findIndex((r) => r.id === id)
    if (index !== -1) {
      reviews.value[index] = response.review
    }
  }

  const bulkApprove = async (reviewIds: string[]) => {
    if (!selectedTenantId.value) return null
    const result = await bulkApproveApi(reviewIds, selectedTenantId.value)
    // Refresh after bulk operation
    await fetchReviews(selectedTenantId.value)
    return result
  }

  const fetchConfigs = async (tenantId: string) => {
    const response = await getReviewConfigsApi(tenantId)
    reviewConfigs.value = response.configs
  }

  const updateConfig = async (
    tenantId: string,
    eventType: string,
    config: { policy: string; requiredRole?: string; externalAdapterType?: string },
  ) => {
    await setReviewConfigApi(tenantId, eventType, config)
    await fetchConfigs(tenantId)
  }

  return {
    // State
    reviews,
    reviewConfigs,
    loading,
    selectedTenantId,
    statusFilter,

    // Computed
    pendingCount,
    filteredReviews,

    // Actions
    fetchReviews,
    approve,
    reject,
    bulkApprove,
    fetchConfigs,
    updateConfig,
  }
})
