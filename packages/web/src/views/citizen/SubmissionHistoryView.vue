<!--
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
-->

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getSelfServiceSubmissions, type SelfServiceSubmission } from '@/api/selfService'
import StatusBadge from '@/components/StatusBadge.vue'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const submissions = ref<SelfServiceSubmission[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const tenantId = route.params.tenantId as string

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const result = await getSelfServiceSubmissions()
    submissions.value = result.submissions
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load submissions'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function formatEventType(type: string): string {
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/citizen/${tenantId}`" />
      <h1 class="text-h4 ml-2">{{ $t('submissionHistory.title') }}</h1>
    </div>

    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <div v-if="submissions.length">
        <v-card
          v-for="submission in submissions"
          :key="submission.id"
          variant="outlined"
          class="mb-3 pa-4"
        >
          <div class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-1 font-weight-medium">
                {{ formatEventType(submission.eventType) }}
              </p>
              <p class="text-caption text-grey">
                {{ $t('submissionHistory.submitted', { date: new Date(submission.createdAt).toLocaleString() }) }}
              </p>
            </div>
            <StatusBadge :status="submission.status" />
          </div>
        </v-card>
      </div>

      <v-alert v-else type="info" variant="tonal">
        {{ $t('submissionHistory.noSubmissions') }}
      </v-alert>
    </LoadingState>
  </div>
</template>
