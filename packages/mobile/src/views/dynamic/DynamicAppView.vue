<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { useAuthManagerStore } from '@/store/authManager'


const route = useRoute()
const router = useRouter()

const authStore = useAuthManagerStore()
const tenantapp = ref<TenantAppData>()
const highLevelEntities = ref<EntityForm[]>([])
const totalEntities = ref(0)
const isSynced = ref(false)
const tenantStore = useTenantStore()
// const user = ref<AuthResult | null>(null)

onMounted(async () => {
  const tenant = await tenantStore.getTenant(route.params.id as string)
  tenantapp.value = tenant
  highLevelEntities.value = tenantapp.value.entityForms.filter((entity) => !entity.dependsOn)
  // check if the tenantapp is synced
  const syncStatus = await store.getUnsyncedEventsCount()
  isSynced.value = syncStatus === 0
  // const isAuthenticated = await store.isAuthenticated()

  // sync with the backend
  try {
    await store.syncWithSyncServer()
  } catch (error) {
    console.error('Sync failed', error)
  }

  // count all entities
  const data = await store.getAllEntities()
  totalEntities.value = data.length
})

const onBack = () => {
  router.push({ name: 'home' })
}

const onLogout = () => {
  authStore.initialize(route.params.id as string)
  authStore.logout()
 
  router.push({ name: 'app-login', params: { id: route.params.id } })
}

const onSync = async () => {
  try {
    await store.syncWithSyncServer()
    isSynced.value = (await store.getUnsyncedEventsCount()) === 0
  } catch (error) {
    console.error('Sync failed', error)
  }
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>
    <div class="card banner text-color-white rounded-3 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <h5>{{ tenantapp?.name }}</h5>
          <div class="d-flex gap-2">
            <button v-if="!isSynced" class="btn btn-sm btn-primary" color="white" @click="onSync">
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
        <!-- <br />
        <small>Synced: {{ isSynced ? 'Yes' : 'No' }}</small> -->
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
