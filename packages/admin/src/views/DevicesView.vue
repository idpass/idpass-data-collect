<script setup lang="ts">
import { ref, watch } from 'vue'
import { getDevices, type DeviceSyncSummary } from '@/api'

const props = defineProps<{ configId: string }>()

const devices = ref<DeviceSyncSummary[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const headers = [
  { title: 'Device', key: 'deviceId' },
  { title: 'User', key: 'userId' },
  { title: 'Last pull', key: 'lastPullAt' },
  { title: 'Last push', key: 'lastPushAt' },
  { title: 'Total pulled', key: 'totalPulled', align: 'end' as const },
  { title: 'Total pushed', key: 'totalPushed', align: 'end' as const },
]

const load = async () => {
  loading.value = true
  error.value = null
  try {
    devices.value = await getDevices(props.configId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(() => props.configId, load, { immediate: true })

const formatDate = (iso: string | null): string => {
  return iso ? new Date(iso).toLocaleString() : '—'
}
</script>

<template>
  <v-container class="devices-view" fluid>
    <div class="page-header">
      <div class="page-header__text">
        <h1 class="page-header__title">Per-device sync activity</h1>
        <p class="page-header__subtitle">
          Review which devices have synced for this collection program.
        </p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-card border="md" elevation="0" class="devices-card">
      <v-data-table
        :headers="headers"
        :items="devices"
        :loading="loading"
        :no-data-text="'No devices have synced yet'"
        density="comfortable"
        class="devices-table"
      >
        <template #[`item.lastPullAt`]="{ item }">
          {{ formatDate(item.lastPullAt) }}
        </template>
        <template #[`item.lastPushAt`]="{ item }">
          {{ formatDate(item.lastPushAt) }}
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<style scoped>
.devices-view {
  padding-bottom: var(--spacing-2xl);
}

.devices-card {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.devices-table {
  border-radius: var(--radius-lg);
}
</style>
