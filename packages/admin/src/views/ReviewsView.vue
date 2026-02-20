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
      class="elevation-1"
    >
      <template #item.entityGuid="{ item }">
        <span class="entity-guid" :title="item.entityGuid">
          {{ item.entityGuid.substring(0, 8) }}...
        </span>
      </template>

      <template #item.createdAt="{ item }">
        {{ formatDate(item.createdAt) }}
      </template>

      <template #item.status="{ item }">
        <v-chip :color="statusColor(item.status)" size="small" variant="tonal">
          {{ item.status }}
        </v-chip>
      </template>

      <template #item.actions="{ item }">
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
  </v-container>
</template>

<style scoped>
.entity-guid {
  font-family: monospace;
  font-size: 0.85rem;
}
</style>
