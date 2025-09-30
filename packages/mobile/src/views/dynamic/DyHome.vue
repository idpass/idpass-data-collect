<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import Dialog from '@/components/SaveDialog.vue'
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { Barcode, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const isMobile = ref(['android', 'ios'].includes(Capacitor.getPlatform()))
const isGrantedPermissions = ref(false)
const isDevelop = import.meta.env.VITE_DEVELOP === 'true'

const database = useDatabase()
const tenantapps = ref<TenantAppData[]>([])
const openInputAppDialog = ref(false)
const appUrl = ref('')

const tenantappsDb = database.tenantapps.find()
const tenantappsSub = tenantappsDb.$.subscribe((results) => {
  tenantapps.value = results
})

onMounted(() => {})

onUnmounted(() => {
  tenantappsSub.unsubscribe()
})

const devHandleClickClearData = async () => {
  await database.tenantapps.remove()
  localStorage.clear()
  sessionStorage.clear()
  //refresh the page
  window.location.reload()
}

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
}

const scanSingleBarcode = async (): Promise<Barcode> => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    document.querySelector('body')?.classList.add('barcode-scanner-active')

    const listener = await BarcodeScanner.addListener('barcodeScanned', async (result) => {
      await listener.remove()
      document.querySelector('body')?.classList.remove('barcode-scanner-active')
      await BarcodeScanner.stopScan()
      resolve(result.barcode)
    })

    await BarcodeScanner.startScan()
  })
}

const scan = async () => {
  if (!isGrantedPermissions.value) {
    const granted = await requestPermissions()
    isGrantedPermissions.value = granted
    if (!granted) {
      return
    }
  }

  const code = await scanSingleBarcode()
  const url = code.displayValue
  return url
}

const loadApp = async (url: string) => {
  try {
    const response = await fetch(url)
    const json = await response.json()
    await database.tenantapps.upsert({
      ...json
    })
  } catch (error) {
    console.error(error)
    alert('Error loading app')
  }
}

const handleLoadAppFromInput = async () => {
  await loadApp(appUrl.value)
  openInputAppDialog.value = false
}

const handleClickAddApp = async () => {
  let url = ''
  if (isMobile.value) {
    url = await scan()
    await loadApp(url)
    return
  } else {
    openInputAppDialog.value = true
  }
}

const handleClickApp = (appId: string) => {
  router.push('/app/' + appId)
}
</script>

<template>
  <div class="d-flex flex-column gap-2">
    <h2 class="mb-4">Apps</h2>
    <div v-show="!tenantapps.length" class="text-center mt-5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
        fill="currentColor"
        class="bi bi-inbox mb-3 text-muted"
        viewBox="0 0 16 16"
      >
        <path
          d="M4.98 4a.5.5 0 0 0-.39.188L1.54 8H6a.5.5 0 0 1 .5.5 1.5 1.5 0 1 0 3 0A.5.5 0 0 1 10 8h4.46l-3.05-3.812A.5.5 0 0 0 11.02 4H4.98zm-1.17-.437A1.5 1.5 0 0 1 4.98 3h6.04a1.5 1.5 0 0 1 1.17.563l3.7 4.625a.5.5 0 0 1 .106.374l-.39 3.124A1.5 1.5 0 0 1 14.117 13H1.883a1.5 1.5 0 0 1-1.489-1.314l-.39-3.124a.5.5 0 0 1 .106-.374l3.7-4.625z"
        />
      </svg>
      <p class="lead">No apps found</p>
      <small color="grey" class="text-center d-flex align-items-center justify-content-center w-100"
        >Hint: Download app config by clicking the camera icon.</small
      >
    </div>
    <ul role="list" class="list-group list-group-flush shadow-sm mt-2">
      <li v-for="app in tenantapps" :key="app.name" class="card border-0 rounded-0">
        <div
          class="card-body border-bottom d-flex justify-content-between align-items-center"
          style="cursor: pointer"
          @click="handleClickApp(app.id)"
        >
          <div>
            <p class="m-0 lead fw-bold text-black">
              {{ app.name }}
            </p>
          </div>
          <ChevronRight />
        </div>
      </li>
    </ul>

    <button
      v-if="isDevelop"
      class="btn btn-danger my-2"
      type="button"
      @click="devHandleClickClearData"
    >
      Clear all data (dev)
    </button>
  </div>

  <Dialog
    :open="openInputAppDialog"
    :title="'Load App'"
    @update:open="openInputAppDialog = $event"
    :onSave="handleLoadAppFromInput"
  >
    <template #form-content>
      <div class="mb-3">
        <label for="appUrl" class="form-label">App URL</label>
        <input type="text" class="form-control" id="appUrl" v-model="appUrl" />
      </div>
    </template>
  </Dialog>
  <button
    class="btn btn-primary p-3 rounded-circle position-absolute"
    style="bottom: 1rem; right: 1rem"
    @click="handleClickAddApp"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      style="height: 2rem; width: 2rem; fill: #fff"
    >
      <path
        d="M149.1 64.8L138.7 96H64C28.7 96 0 124.7 0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160c0-35.3-28.7-64-64-64H373.3L362.9 64.8C356.4 45.2 338.1 32 317.4 32H194.6c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"
      />
    </svg>
  </button>
</template>
