<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { isOnline, onNetworkChange } from '@/utils/networkUtils'
import { useErrorHandler } from '@/composables/useErrorHandler'

const route = useRoute()
const router = useRouter()

const tenantapp = ref<TenantAppData>()
const highLevelEntities = ref<EntityForm[]>([])
const totalEntities = ref(0)
const isSynced = ref(false)
const isOffline = ref(false)
const tenantStore = useTenantStore()
let networkCleanup: (() => void) | null = null

// Add error message state
const errorMessage = ref('')
const showError = ref(false)

const { handleError, handleAuthError } = useErrorHandler(route.params.id as string)

// Add function to show error messages
const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

const syncWithErrorHandling = async (): Promise<boolean> => {
  try {
    await store.syncWithSyncServer()
    return true
  } catch (error) {
    const errorResult = await handleError(error, route.params.id as string)
    if (errorResult.handled) {
      // Show user-friendly error message
      displayError(errorResult.message)
    }
    return false // Always return false for any error, even if handled
  }
}

onMounted(async () => {
  // Check initial network status
  isOffline.value = !(await isOnline())
  
  // Set up network status listener
  networkCleanup = onNetworkChange((online) => {
    isOffline.value = !online
    if (online && !isSynced.value) {
      // Auto-sync when coming back online if not synced
      onSync()
    }
  })

  const tenant = await tenantStore.getTenant(route.params.id as string)
  tenantapp.value = tenant
  highLevelEntities.value = tenantapp.value.entityForms.filter((entity) => !entity.dependsOn)
  
  // check if the tenantapp is synced
  const syncStatus = await store.getUnsyncedEventsCount()
  isSynced.value = syncStatus === 0

  // sync with the backend only if online
  if (!isOffline.value) {
    await syncWithErrorHandling()
  }

  // count all entities
  const data = await store.getAllEntities()
  totalEntities.value = data.length
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
    displayError('Cannot sync while offline. Please check your connection.')
    return
  }

  const syncSuccess = await syncWithErrorHandling()
  if (syncSuccess) {
    isSynced.value = (await store.getUnsyncedEventsCount()) === 0
    displayError('Sync completed successfully!', 3000)
  }
  // Note: Error messages are already displayed in syncWithErrorHandling for failures
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>
    
    <!-- Error Message Alert -->
    <div v-if="showError" class="alert alert-dismissible fade show" 
         :class="errorMessage.includes('successfully') ? 'alert-success' : 'alert-danger'" 
         role="alert">
      <i class="bi" :class="errorMessage.includes('successfully') ? 'bi-check-circle' : 'bi-exclamation-triangle'"></i>
      {{ errorMessage }}
      <i class="bi bi-x" @click="showError = false" aria-label="Close"></i>
    </div>
    
    <div class="card banner text-color-white rounded-3 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <h5>{{ tenantapp?.name }}</h5>
          <div class="d-flex gap-2">
            <button 
              v-if="!isSynced && !isOffline" 
              class="btn btn-sm btn-primary" 
              color="white" 
              @click="onSync"
            >
              <i class="bi bi-arrow-clockwise"></i>
              Sync
            </button>
            
            <button class="btn btn-sm btn-primary" @click="onLogout">
              <i class="bi bi-box-arrow-right"></i>
              Logout
            </button>
          </div>
        </div>
        <small>Total entities: {{ totalEntities }}</small>
        <br v-if="isOffline" />
        <span v-if="isOffline" class="badge bg-warning text-dark">
            <i class="bi bi-wifi-off"></i>
            Offline
        </span>
        <small v-if="isOffline" class="text-warning">
          Sync when connection is restored
        </small>
      </div>
    </div>
    <hr />
    <div class="mb-1"></div>

    <div v-if="tenantapp" class="mt-2">
      <h5 class="mb-4">Forms</h5>
      <ul role="list" class="list-group list-group-flush shadow-sm mt-2">
        <li v-for="entity in highLevelEntities" :key="entity.name" class="card border-0 rounded-0">
          <div
            @click="router.push(`/app/${tenantapp.id}/${entity.name}`)"
            class="card-body border-bottom d-flex justify-content-between align-items-center"
          >
            <div>
              <p class="m-0 lead fw-bold text-black">
                {{ entity.title }}
              </p>
            </div>
            <ChevronRight />
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
