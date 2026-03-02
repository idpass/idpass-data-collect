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

const tenantId = ref(route.params.id as string)
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
    await reviewsStore.updateConfig(tenantId.value, editingConfig.value.eventType, {
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
  router.push({ name: 'app-details', params: { id: tenantId.value } })
}

onMounted(async () => {
  loading.value = true
  try {
    await reviewsStore.fetchConfigs(tenantId.value)
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
    <v-btn class="mb-4" variant="text" prepend-icon="mdi-arrow-left" @click="goBack">
      Back to Collection Program
    </v-btn>

    <h1 class="text-h4 mb-4">Review Configuration</h1>

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
      class="elevation-1"
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
    <v-dialog v-model="showEditDialog" max-width="500">
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
          <v-btn color="primary" variant="tonal" :loading="loading" @click="saveConfig">
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
