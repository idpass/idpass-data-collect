<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getApps } from '@/api'
import type { AppListItem, ReviewRecord } from '@/api'
import { useReviewsStore } from '@/stores/reviews'
import { useSnackBarStore } from '@/stores/snackBar'

const reviewsStore = useReviewsStore()
const snackBarStore = useSnackBarStore()

const tenants = ref<AppListItem[]>([])
const selectedTenantId = ref<string | null>(null)
const selectedStatus = ref<string | null>(null)
const selectedReviewIds = ref<string[]>([])
const showRejectDialog = ref(false)
const rejectionReason = ref('')
const rejectingReviewId = ref<string | null>(null)
const selectedReview = ref<ReviewRecord | null>(null)
const showDetailDialog = ref(false)
const showRawJson = ref(false)

const statusOptions = [
  { title: 'All', value: null },
  { title: 'Pending', value: 'pending' },
  { title: 'Approved', value: 'approved' },
  { title: 'Rejected', value: 'rejected' },
]

const headers = [
  { title: 'Entity', value: 'entityGuid', sortable: true },
  { title: 'Event Type', value: 'eventType', sortable: true },
  { title: 'Submitted By', value: 'submittedBy', sortable: true },
  { title: 'Date', value: 'createdAt', sortable: true },
  { title: 'Status', value: 'status', sortable: true },
  { title: 'Actions', value: 'actions', sortable: false },
]

const statusColor = (status: string): string => {
  switch (status) {
    case 'pending': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    default: return 'grey'
  }
}

const formatDate = (dateString: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

const formatFieldLabel = (key: string): string => {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const formDataEntries = computed(() => {
  if (!selectedReview.value?.formData?.data) return []
  return Object.entries(selectedReview.value.formData.data).map(([key, value]) => ({
    label: formatFieldLabel(key),
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
  }))
})

const handleRowClick = (_event: Event, row: { item: ReviewRecord }) => {
  selectedReview.value = row.item
  showRawJson.value = false
  showDetailDialog.value = true
}

const handleDialogApprove = async () => {
  if (!selectedReview.value) return
  await handleApprove(selectedReview.value)
  // Refresh the selected review from the store after approval
  const updated = reviewsStore.reviews.find((r: ReviewRecord) => r.id === selectedReview.value?.id)
  if (updated) {
    selectedReview.value = updated
  }
}

const openRejectFromDialog = () => {
  if (!selectedReview.value) return
  openRejectDialog(selectedReview.value)
}

const displayedReviews = computed(() => {
  if (!selectedStatus.value) {
    return reviewsStore.reviews
  }
  return reviewsStore.reviews.filter(
    (r: ReviewRecord) => r.status === selectedStatus.value,
  )
})

const hasSelectedReviews = computed(() => selectedReviewIds.value.length > 0)

const loadTenants = async () => {
  try {
    const response = await getApps()
    tenants.value = response.data
  } catch (error) {
    console.error('Failed to load tenants', error)
  }
}

const loadReviews = async () => {
  if (!selectedTenantId.value) return
  try {
    await reviewsStore.fetchReviews(selectedTenantId.value)
  } catch (error) {
    snackBarStore.showSnackbar('Failed to load reviews', 'error')
    console.error('Failed to load reviews', error)
  }
}

const handleApprove = async (review: ReviewRecord) => {
  try {
    await reviewsStore.approve(review.id)
    snackBarStore.showSnackbar('Review approved', 'success')
  } catch (error) {
    snackBarStore.showSnackbar('Failed to approve review', 'error')
    console.error('Failed to approve', error)
  }
}

const openRejectDialog = (review: ReviewRecord) => {
  rejectingReviewId.value = review.id
  rejectionReason.value = ''
  showRejectDialog.value = true
}

const handleReject = async () => {
  if (!rejectingReviewId.value || !rejectionReason.value.trim()) return
  try {
    await reviewsStore.reject(rejectingReviewId.value, rejectionReason.value)
    showRejectDialog.value = false
    snackBarStore.showSnackbar('Review rejected', 'success')
  } catch (error) {
    snackBarStore.showSnackbar('Failed to reject review', 'error')
    console.error('Failed to reject', error)
  }
}

const handleBulkApprove = async () => {
  try {
    const result = await reviewsStore.bulkApprove(selectedReviewIds.value)
    selectedReviewIds.value = []
    if (result) {
      snackBarStore.showSnackbar(`${result.approved} review(s) approved`, 'success')
    }
  } catch (error) {
    snackBarStore.showSnackbar('Failed to bulk approve', 'error')
    console.error('Failed to bulk approve', error)
  }
}

watch(selectedTenantId, () => {
  selectedReviewIds.value = []
  loadReviews()
})

onMounted(() => {
  loadTenants()
})
</script>

<template>
  <v-container>
    <h1 class="text-h4 mb-4">Reviews</h1>

    <v-row class="mb-4" align="center">
      <v-col cols="12" md="4">
        <v-select
          v-model="selectedTenantId"
          :items="tenants"
          item-title="name"
          item-value="id"
          label="Select Collection Program"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="4">
        <v-chip-group v-model="selectedStatus" column>
          <v-chip
            v-for="option in statusOptions"
            :key="String(option.value)"
            :value="option.value"
            filter
            variant="outlined"
          >
            {{ option.title }}
          </v-chip>
        </v-chip-group>
      </v-col>
      <v-col cols="12" md="4" class="text-right">
        <v-btn
          v-if="hasSelectedReviews"
          color="success"
          variant="tonal"
          prepend-icon="mdi-check-all"
          @click="handleBulkApprove"
        >
          Approve Selected ({{ selectedReviewIds.length }})
        </v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="!selectedTenantId" type="info" variant="tonal" class="mb-4">
      Select a collection program to view its reviews.
    </v-alert>

    <v-data-table
      v-if="selectedTenantId"
      v-model="selectedReviewIds"
      :headers="headers"
      :items="displayedReviews"
      :loading="reviewsStore.loading"
      item-value="id"
      show-select
      class="elevation-1 reviews-table"
      @click:row="handleRowClick"
    >
      <template #[`item.entityGuid`]="{ item }">
        <span class="entity-guid" :title="item.entityGuid">
          {{ item.entityGuid.substring(0, 8) }}...
        </span>
      </template>

      <template #[`item.createdAt`]="{ item }">
        {{ formatDate(item.createdAt) }}
      </template>

      <template #[`item.status`]="{ item }">
        <v-chip :color="statusColor(item.status)" size="small" variant="tonal">
          {{ item.status }}
        </v-chip>
      </template>

      <template #[`item.actions`]="{ item }">
        <template v-if="item.status === 'pending'">
          <v-btn
            variant="text"
            icon="mdi-check"
            color="success"
            size="small"
            class="mr-1"
            @click="handleApprove(item)"
          />
          <v-btn
            variant="text"
            icon="mdi-close"
            color="error"
            size="small"
            @click="openRejectDialog(item)"
          />
        </template>
        <span v-else-if="item.status === 'rejected'" class="text-caption text-medium-emphasis">
          {{ item.rejectionReason }}
        </span>
      </template>
    </v-data-table>

    <!-- Reject Dialog -->
    <v-dialog v-model="showRejectDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6">Reject Review</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="rejectionReason"
            label="Rejection Reason"
            placeholder="Provide a reason for rejecting this review..."
            variant="outlined"
            rows="3"
            :rules="[(v: string) => !!v.trim() || 'Reason is required']"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showRejectDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            :disabled="!rejectionReason.trim()"
            @click="handleReject"
          >
            Reject
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Review Detail Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="700">
      <v-card v-if="selectedReview">
        <v-card-title class="d-flex align-center justify-space-between">
          <span class="text-h6">Review Detail</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>

        <v-card-text>
          <div class="d-flex align-center ga-2 mb-4">
            <v-chip :color="statusColor(selectedReview.status)" size="small" variant="tonal">
              {{ selectedReview.status }}
            </v-chip>
            <span class="text-body-1 font-weight-medium">{{ selectedReview.eventType }}</span>
          </div>

          <div class="detail-meta mb-4">
            <div class="detail-meta-row">
              <span class="detail-meta-label">Entity</span>
              <span class="detail-meta-value mono-text">{{ selectedReview.entityGuid }}</span>
            </div>
            <div class="detail-meta-row">
              <span class="detail-meta-label">Submitted by</span>
              <span class="detail-meta-value">{{ selectedReview.submittedBy }}</span>
            </div>
            <div class="detail-meta-row">
              <span class="detail-meta-label">Date</span>
              <span class="detail-meta-value">{{ formatDate(selectedReview.createdAt) }}</span>
            </div>
            <div v-if="selectedReview.reviewedBy" class="detail-meta-row">
              <span class="detail-meta-label">Reviewed by</span>
              <span class="detail-meta-value">{{ selectedReview.reviewedBy }}</span>
            </div>
            <div v-if="selectedReview.reviewedAt" class="detail-meta-row">
              <span class="detail-meta-label">Reviewed at</span>
              <span class="detail-meta-value">{{ formatDate(selectedReview.reviewedAt) }}</span>
            </div>
            <div v-if="selectedReview.rejectionReason" class="detail-meta-row">
              <span class="detail-meta-label">Rejection reason</span>
              <span class="detail-meta-value text-error">{{ selectedReview.rejectionReason }}</span>
            </div>
          </div>

          <v-divider class="mb-4" />

          <h3 class="text-subtitle-1 font-weight-bold mb-3">Submitted Data</h3>

          <v-table v-if="formDataEntries.length > 0" density="compact" class="mb-3">
            <tbody>
              <tr v-for="entry in formDataEntries" :key="entry.label">
                <td class="text-medium-emphasis font-weight-medium" style="width: 40%">
                  {{ entry.label }}
                </td>
                <td>{{ entry.value }}</td>
              </tr>
            </tbody>
          </v-table>

          <div v-else class="text-medium-emphasis text-body-2 mb-3">No form data available.</div>

          <v-btn
            variant="text"
            size="small"
            :prepend-icon="showRawJson ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            class="mb-2"
            @click="showRawJson = !showRawJson"
          >
            Raw JSON
          </v-btn>

          <v-sheet v-if="showRawJson" class="data-sheet pa-3" color="surface-variant">
            <pre class="data-display">{{ JSON.stringify(selectedReview.formData, null, 2) }}</pre>
          </v-sheet>
        </v-card-text>

        <v-card-actions v-if="selectedReview.status === 'pending'">
          <v-spacer />
          <v-btn color="error" variant="tonal" @click="openRejectFromDialog">
            Reject
          </v-btn>
          <v-btn color="success" variant="tonal" @click="handleDialogApprove">
            Approve
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.entity-guid {
  font-family: monospace;
  font-size: 0.85rem;
}

.reviews-table :deep(tbody tr) {
  cursor: pointer;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-meta-row {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
}

.detail-meta-label {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.6);
  min-width: 120px;
  flex-shrink: 0;
}

.detail-meta-value {
  color: rgba(0, 0, 0, 0.87);
  word-break: break-word;
}

.mono-text {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.85rem;
}

.data-sheet {
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.02);
}

.data-display {
  margin: 0;
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  line-height: 1.5;
  overflow-x: auto;
}
</style>
