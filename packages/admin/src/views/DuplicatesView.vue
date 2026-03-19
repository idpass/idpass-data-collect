<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDuplicatesStore } from '@/stores/duplicates'
import { useSnackBarStore } from '@/stores/snackBar'
import type { PotentialDuplicate } from '@/api'

const route = useRoute()
const router = useRouter()
const duplicatesStore = useDuplicatesStore()
const snackBarStore = useSnackBarStore()

const configId = ref(route.params.id as string)
const showResolveDialog = ref(false)
const showConfirmDeleteDialog = ref(false)
const selectedDuplicate = ref<PotentialDuplicate | null>(null)

const headers = [
  { title: 'Entity A', value: 'entityGuid', sortable: true },
  { title: 'Entity B', value: 'duplicateGuid', sortable: true },
  { title: 'Actions', value: 'actions', sortable: false },
]

const openResolveDialog = (duplicate: PotentialDuplicate) => {
  selectedDuplicate.value = duplicate
  showResolveDialog.value = true
}

const handleResolve = async (shouldDeleteNew: boolean) => {
  if (!selectedDuplicate.value) return
  try {
    await duplicatesStore.resolve({
      newItem: selectedDuplicate.value.duplicateGuid,
      existingItem: selectedDuplicate.value.entityGuid,
      shouldDeleteNewItem: shouldDeleteNew,
      configId: configId.value,
    })
    showResolveDialog.value = false
    snackBarStore.showSnackbar('Duplicate resolved', 'success')
  } catch (error) {
    snackBarStore.showSnackbar('Failed to resolve duplicate', 'error')
    console.error('Failed to resolve duplicate', error)
  }
}

const goBack = () => {
  router.push({ name: 'app-details', params: { id: configId.value } })
}

onMounted(() => {
  duplicatesStore.fetchDuplicates(configId.value)
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
        <h1 class="page-header__title">Potential Duplicates</h1>
        <p class="page-header__subtitle">Identify and resolve duplicate entity records</p>
      </div>
    </div>

    <v-alert
      v-if="!duplicatesStore.loading && duplicatesStore.duplicates.length === 0"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      No potential duplicates found for this collection program.
    </v-alert>

    <v-data-table
      v-if="duplicatesStore.duplicates.length > 0"
      :headers="headers"
      :items="duplicatesStore.duplicates"
      :loading="duplicatesStore.loading"
      class="duplicates-table"
    >
      <template #[`item.entityGuid`]="{ item }">
        <span class="entity-guid" :title="item.entityGuid">
          {{ item.entityGuid.substring(0, 12) }}...
        </span>
      </template>

      <template #[`item.duplicateGuid`]="{ item }">
        <span class="entity-guid" :title="item.duplicateGuid">
          {{ item.duplicateGuid.substring(0, 12) }}...
        </span>
      </template>

      <template #[`item.actions`]="{ item }">
        <v-btn
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-compare"
          @click="openResolveDialog(item)"
        >
          Resolve
        </v-btn>
      </template>
    </v-data-table>

    <!-- Resolve Dialog -->
    <v-dialog v-model="showResolveDialog" :max-width="540">
      <v-card v-if="selectedDuplicate">
        <v-card-title class="text-h6">Resolve Duplicate</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="6">
              <v-card variant="outlined">
                <v-card-subtitle>Entity A (Existing)</v-card-subtitle>
                <v-card-text class="entity-guid">
                  {{ selectedDuplicate.entityGuid }}
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="6">
              <v-card variant="outlined">
                <v-card-subtitle>Entity B (Duplicate)</v-card-subtitle>
                <v-card-text class="entity-guid">
                  {{ selectedDuplicate.duplicateGuid }}
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showResolveDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="showConfirmDeleteDialog = true"
          >
            Keep Existing
          </v-btn>
          <v-btn
            color="warning"
            variant="tonal"
            @click="handleResolve(false)"
          >
            Keep Both
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm deletion dialog -->
    <v-dialog v-model="showConfirmDeleteDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Confirm</v-card-title>
        <v-card-text>
          This will permanently remove the duplicate entity. Continue?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showConfirmDeleteDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="tonal"
            @click="showConfirmDeleteDialog = false; handleResolve(true)"
          >
            Confirm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.entity-guid {
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.duplicates-table {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-card);
}
</style>
