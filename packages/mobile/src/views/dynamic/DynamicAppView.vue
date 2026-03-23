<script setup lang="ts">
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { isOnline, onNetworkChange } from '@/utils/networkUtils'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSnackbar } from '@/composables/useSnackbar'

const route = useRoute()
const router = useRouter()

const tenantapp = ref<TenantAppData>()
const highLevelEntities = ref<EntityForm[]>([])
const totalEntities = ref(0)
const pendingRecords = ref(0)
const isSynced = ref(false)
const isOffline = ref(false)
const isSyncing = ref(false)
const tenantStore = useTenantStore()
let networkCleanup: (() => void) | null = null
const { showError, showSuccess } = useSnackbar()
const { handleError, handleAuthError } = useErrorHandler(route.params.id as string)

const statsSummary = computed(() => {
  const synced = Math.max(totalEntities.value - pendingRecords.value, 0)
  return {
    synced,
    pending: pendingRecords.value,
    total: totalEntities.value
  }
})

const syncWithErrorHandling = async (): Promise<boolean> => {
  try {
    isSyncing.value = true
    await store.syncWithSyncServer()
    return true
  } catch (error) {
    const errorResult = await handleError(error, route.params.id as string)
    if (errorResult.handled) {
      showError(errorResult.message)
    }
    return false
  } finally {
    isSyncing.value = false
  }
}

const refreshCounts = async () => {
  const [entities, unsynced] = await Promise.all([
    store.getAllEntities(),
    store.getUnsyncedEventsCount()
  ])
  totalEntities.value = entities.length
  pendingRecords.value = unsynced
  isSynced.value = unsynced === 0
}

onMounted(async () => {
  isOffline.value = !(await isOnline())

  networkCleanup = onNetworkChange((online) => {
    isOffline.value = !online
    if (online && !isSynced.value) {
      onSync()
    }
  })

  const tenant = await tenantStore.getTenant(route.params.id as string)
  tenantapp.value = tenant
  highLevelEntities.value = tenantapp.value.entityForms.filter((entity) => !entity.dependsOn)

  await refreshCounts()

  if (!isOffline.value) {
    await syncWithErrorHandling()
    await refreshCounts()
  }
})

onUnmounted(() => {
  if (networkCleanup) {
    networkCleanup()
  }
})

const onBack = () => {
  router.push({ name: 'home' })
}

const onLogout = async () => {
  await handleAuthError(route.params.id as string)
}

const onSync = async () => {
  if (isOffline.value) {
    showError('Sync requires an online connection. Please check your network and try again.')
    return
  }

  const syncSuccess = await syncWithErrorHandling()
  if (syncSuccess) {
    await refreshCounts()
    showSuccess('Sync completed successfully!')
  }
}

const formattedVersion = computed(() => `v${tenantapp.value?.version ?? '—'}`)

const statusLabel = computed(() => {
  if (isOffline.value) return 'Offline mode'
  if (isSyncing.value) return 'Syncing...'
  if (isSynced.value) return 'Synced'
  return 'Pending sync'
})

const statusColor = computed(() => {
  if (isOffline.value) return 'warning'
  if (isSynced.value) return 'success'
  return 'info'
})

const stats = computed(() => [
  { label: 'Synced', value: statsSummary.value.synced, hint: 'records available', color: 'success' },
  { label: 'Pending', value: statsSummary.value.pending, hint: 'waiting to sync', color: 'warning' },
  { label: 'Forms', value: highLevelEntities.value.length, hint: 'ready to collect', color: 'info' },
])
</script>

<template>
  <v-container v-if="tenantapp" fluid class="pa-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="tonal" size="small" @click="onBack" aria-label="Back to Collection Programs" />
      <div class="d-flex ga-2">
        <v-btn
          prepend-icon="mdi-sync"
          color="secondary"
          variant="flat"
          size="small"
          :disabled="isSyncing || isOffline"
          :loading="isSyncing"
          :title="isOffline ? 'Sync requires an online connection' : 'Sync with server'"
          @click="onSync"
        >
          Sync
        </v-btn>
        <v-btn
          prepend-icon="mdi-logout"
          variant="tonal"
          size="small"
          @click="onLogout"
        >
          Logout
        </v-btn>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text>
        <div class="d-flex justify-space-between align-start ga-3">
          <div>
            <div class="text-h6 font-weight-bold">{{ tenantapp.name }}</div>
            <p class="text-body-2 text-medium-emphasis mt-1">{{ tenantapp.description }}</p>
          </div>
          <v-chip size="small" color="primary" variant="tonal">{{ formattedVersion }}</v-chip>
        </div>
        <div class="mt-3">
          <v-chip size="small" :color="statusColor" variant="tonal" :prepend-icon="isOffline ? 'mdi-wifi-off' : isSynced ? 'mdi-check-circle' : 'mdi-sync'">
            {{ statusLabel }}
          </v-chip>
        </div>
      </v-card-text>
    </v-card>

    <v-row dense class="mb-4">
      <v-col v-for="stat in stats" :key="stat.label" cols="4">
        <v-card elevation="1" class="text-center pa-3">
          <div class="text-overline text-medium-emphasis">{{ stat.label }}</div>
          <div class="text-h5 font-weight-bold">{{ stat.value }}</div>
          <div class="text-caption text-medium-emphasis">{{ stat.hint }}</div>
        </v-card>
      </v-col>
    </v-row>

    <div class="text-subtitle-2 font-weight-bold mb-2">Forms ({{ highLevelEntities.length }})</div>

    <v-list lines="two" rounded="xl" elevation="1" bg-color="surface">
      <v-list-item
        v-for="entity in highLevelEntities"
        :key="entity.name"
        @click="router.push(`/app/${tenantapp.id}/${entity.name}`)"
        append-icon="mdi-chevron-right"
      >
        <v-list-item-title class="font-weight-bold">{{ entity.title }}</v-list-item-title>
        <v-list-item-subtitle>{{ entity.description || 'Tap to start collecting' }}</v-list-item-subtitle>
        <template #prepend>
          <v-chip size="x-small" color="info" variant="tonal" class="mr-3">
            {{ entity.displayTemplate || 'Form' }}
          </v-chip>
        </template>
      </v-list-item>
    </v-list>
  </v-container>
</template>
