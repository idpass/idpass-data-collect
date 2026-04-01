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
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReviewsStore } from '@/stores/reviews'
import { useSnackBarStore } from '@/stores/snackBar'
import type { ReviewConfigRecord } from '@/api'

const route = useRoute()
const router = useRouter()
const reviewsStore = useReviewsStore()
const snackBarStore = useSnackBarStore()

const programId = ref(route.params.id as string)
const loading = ref(false)

const policyOptions = [
  { title: 'Auto-approve', value: 'auto-approve' },
  { title: 'Internal Review', value: 'internal-review' },
  { title: 'External Delegate', value: 'external-delegate' },
]

const roleOptions = [
  { title: 'System Admin', value: 'system-admin' },
  { title: 'Program Admin', value: 'program-admin' },
  { title: 'Supervisor', value: 'supervisor' },
]

const headers = [
  { title: 'Event Type', value: 'eventType', sortable: true },
  { title: 'Policy', value: 'policy', sortable: true },
  { title: 'Required Role', value: 'requiredRole', sortable: false },
  { title: 'Actions', value: 'actions', sortable: false },
]

const editingConfig = ref<ReviewConfigRecord | null>(null)
const showEditDialog = ref(false)
const editPolicy = ref('')
const editRequiredRole = ref<string | undefined>(undefined)

const openEditDialog = (config: ReviewConfigRecord) => {
  editingConfig.value = config
  editPolicy.value = config.policy
  editRequiredRole.value = config.requiredRole
  showEditDialog.value = true
}

const saveConfig = async () => {
  if (!editingConfig.value) return
  loading.value = true
  try {
    await reviewsStore.updateConfig(programId.value, editingConfig.value.eventType, {
      policy: editPolicy.value,
      requiredRole: editPolicy.value === 'internal-review' ? editRequiredRole.value : undefined,
    })
    showEditDialog.value = false
    snackBarStore.showSnackbar('Review configuration saved', 'success')
  } catch (error) {
    snackBarStore.showSnackbar('Failed to save configuration', 'error')
    console.error('Failed to save config', error)
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push({ name: 'app-details', params: { id: programId.value } })
}

onMounted(async () => {
  loading.value = true
  try {
    await reviewsStore.fetchConfigs(programId.value)
  } catch (error) {
    snackBarStore.showSnackbar('Failed to load review configurations', 'error')
    console.error('Failed to load configs', error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-container>
    <div class="subpage-nav">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
        Collection Program
      </v-btn>
    </div>

    <div class="page-header">
      <div class="page-header__text">
        <h1 class="page-header__title">Review Configuration</h1>
        <p class="page-header__subtitle">Configure review policies for each event type</p>
      </div>
    </div>

    <v-alert type="info" variant="tonal" class="mb-4" density="compact">
      Configure how each event type is reviewed.
      <strong>Auto-approve</strong> skips review entirely.
      <strong>Internal Review</strong> requires a user with the specified role to approve.
      <strong>External Delegate</strong> sends the review to an external system.
    </v-alert>

    <v-data-table
      :headers="headers"
      :items="reviewsStore.reviewConfigs"
      :loading="loading"
      class="review-config-table"
    >
      <template #[`item.policy`]="{ item }">
        <v-chip
          :color="item.policy === 'auto-approve' ? 'success' : item.policy === 'internal-review' ? 'warning' : 'info'"
          size="small"
          variant="tonal"
        >
          {{ item.policy }}
        </v-chip>
      </template>

      <template #[`item.requiredRole`]="{ item }">
        <span v-if="item.requiredRole">{{ item.requiredRole }}</span>
        <span v-else class="text-medium-emphasis">--</span>
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn
          variant="text"
          icon="mdi-pencil"
          size="small"
          @click="openEditDialog(item)"
        />
      </template>
    </v-data-table>

    <v-alert
      v-if="!loading && reviewsStore.reviewConfigs.length === 0"
      type="info"
      variant="tonal"
      class="mt-4"
    >
      No review configurations found. Event types will be auto-approved by default.
    </v-alert>

    <!-- Edit Config Dialog -->
    <v-dialog v-model="showEditDialog" :max-width="540">
      <v-card v-if="editingConfig">
        <v-card-title class="text-h6">
          Edit: {{ editingConfig.eventType }}
        </v-card-title>
        <v-card-text>
          <v-select
            v-model="editPolicy"
            :items="policyOptions"
            item-title="title"
            item-value="value"
            label="Review Policy"
            variant="outlined"
            class="mb-4"
          />
          <v-select
            v-if="editPolicy === 'internal-review'"
            v-model="editRequiredRole"
            :items="roleOptions"
            item-title="title"
            item-value="value"
            label="Required Role"
            variant="outlined"
            clearable
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEditDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="tonal" :loading="loading" :disabled="editPolicy === 'internal-review' && !editRequiredRole" @click="saveConfig">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.review-config-table {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-card);
}
</style>
