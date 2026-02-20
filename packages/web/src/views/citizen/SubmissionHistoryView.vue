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

onMounted(async () => {
  try {
    const result = await getSelfServiceSubmissions()
    submissions.value = result.submissions
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load submissions'
  } finally {
    loading.value = false
  }
})

function formatEventType(type: string): string {
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/citizen/${tenantId}`" />
      <h1 class="text-h4 ml-2">Submission History</h1>
    </div>

    <LoadingState :loading="loading" :error="error">
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
                Submitted {{ new Date(submission.createdAt).toLocaleString() }}
              </p>
            </div>
            <StatusBadge :status="submission.status" />
          </div>
        </v-card>
      </div>

      <v-alert v-else type="info" variant="tonal">
        No submissions yet. Submit a change request from your dashboard.
      </v-alert>
    </LoadingState>
  </div>
</template>
