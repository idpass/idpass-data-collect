<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import Dialog from '@/components/SaveDialog.vue'
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { initStore, closeStore, store } from '@/store'
import { Barcode, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

interface AppStats {
  totalRecords: number
  pendingRecords: number
  syncedRecords: number
}

const router = useRouter()

const isMobile = ref(['android', 'ios'].includes(Capacitor.getPlatform()))
const isGrantedPermissions = ref(false)
const isDevelop = import.meta.env.VITE_DEVELOP === 'true'

const database = useDatabase()
const tenantapps = ref<TenantAppData[]>([])
const appStats = ref<Record<string, AppStats>>({})
const isLoadingStats = ref(false)
const searchTerm = ref('')

const openInputAppDialog = ref(false)
const showAddOptions = ref(false)
const appUrl = ref('')
const filePickerRef = ref<HTMLInputElement | null>(null)

const tenantappsDb = database.tenantapps.find()
const tenantappsSub = tenantappsDb.$.subscribe((results) => {
  tenantapps.value = results
})

onMounted(() => {
  if (tenantapps.value.length) {
    loadStats(tenantapps.value)
  }
})

onUnmounted(() => {
  tenantappsSub.unsubscribe()
})

watch(
  () => tenantapps.value,
  (apps) => {
    if (apps.length) {
      loadStats(apps)
    } else {
      appStats.value = {}
    }
  },
  { deep: true }
)

const filteredApps = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) {
    return tenantapps.value
  }
  return tenantapps.value.filter((app) => {
    return (
      app.name.toLowerCase().includes(term) ||
      app.description?.toLowerCase().includes(term) ||
      app.version?.toLowerCase().includes(term)
    )
  })
})

const availableCount = computed(() => filteredApps.value.length)

const loadStats = async (apps: TenantAppData[]) => {
  isLoadingStats.value = true
  const entries: [string, AppStats][] = []

  for (const app of apps) {
    try {
      await initStore(app.id, app.syncServerUrl)
      const entities = await store.getAllEntities()
      const pendingCount = await store.getUnsyncedEventsCount()
      const stats: AppStats = {
        totalRecords: entities.length,
        pendingRecords: pendingCount,
        syncedRecords: Math.max(entities.length - pendingCount, 0)
      }
      entries.push([app.id, stats])
    } catch (error) {
      console.error('Failed to load stats for app', app.id, error)
      entries.push([app.id, { totalRecords: 0, pendingRecords: 0, syncedRecords: 0 }])
    } finally {
      await closeStore(app.id)
    }
  }

  appStats.value = Object.fromEntries(entries)
  isLoadingStats.value = false
}

const devHandleClickClearData = async () => {
  await database.tenantapps.remove()
  localStorage.clear()
  sessionStorage.clear()
  window.location.reload()
}

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
}

const scanSingleBarcode = (): Promise<Barcode> => {
  return new Promise((resolve, reject) => {
    document.querySelector('body')?.classList.add('barcode-scanner-active')
    let activeListener: { remove: () => Promise<void> } | null = null

    const cleanup = async () => {
      document.querySelector('body')?.classList.remove('barcode-scanner-active')
      await BarcodeScanner.stopScan().catch(() => {})
      if (activeListener) {
        await activeListener.remove()
        activeListener = null
      }
    }

    BarcodeScanner.addListener('barcodeScanned', async (result) => {
      try {
        await cleanup()
        resolve(result.barcode)
      } catch (error) {
        reject(error)
      }
    })
      .then((listener) => {
        activeListener = listener
        void BarcodeScanner.startScan().catch(async (error) => {
          await cleanup()
          reject(error)
        })
      })
      .catch(async (error) => {
        await cleanup()
        reject(error)
      })
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

const saveTenantApp = async (config: TenantAppData, sourceUrl = '') => {
  if (!config?.id || !config?.name || !config?.entityForms) {
    throw new Error('Invalid FormApp configuration')
  }

  await database.tenantapps.upsert({
    ...config,
    url: config.url || sourceUrl
  })
}

const loadAppFromUrl = async (url: string) => {
  try {
    const response = await fetch(url)
    const json = await response.json()
    await saveTenantApp(json, url)
  } catch (error) {
    console.error(error)
    alert('Error loading app configuration. Please try again.')
  }
}

const handleLoadAppFromInput = async () => {
  await loadAppFromUrl(appUrl.value)
  openInputAppDialog.value = false
}

const handleSelectFile = () => {
  showAddOptions.value = false
  filePickerRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const json = JSON.parse(text)
    await saveTenantApp(json)
  } catch (error) {
    console.error(error)
    alert('Unable to import the selected file. Please verify it is a valid FormApp JSON.')
  } finally {
    target.value = ''
  }
}

const handleScanApp = async () => {
  try {
    if (!isMobile.value) {
      openInputAppDialog.value = true
      showAddOptions.value = false
      return
    }

    const url = await scan()
    if (url) {
      await loadAppFromUrl(url)
    }
  } catch (error) {
    console.error(error)
    alert('Unable to scan QR code. Please try again.')
  } finally {
    showAddOptions.value = false
  }
}

const handleEnterUrl = () => {
  showAddOptions.value = false
  openInputAppDialog.value = true
}

const handleClickApp = (appId: string) => {
  router.push('/app/' + appId)
}

const toggleAddOptions = () => {
  showAddOptions.value = !showAddOptions.value
}
</script>

<template>
  <div class="home-screen">
    <header class="home-header">
      <div>
        <h1>FormApps</h1>
        <p>{{ availableCount }} forms available</p>
      </div>
      <div class="search-bar">
        <svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79l5 4.99L20.49 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"
              fill="currentColor"
            />
          </svg>
        <input v-model="searchTerm" type="search" placeholder="Search forms..." />
      </div>
    </header>

    <section class="forms-section" aria-labelledby="your-forms">
      <div class="section-heading">
        <h2 id="your-forms">Your Forms</h2>
        <span v-if="isLoadingStats" class="section-hint">Refreshing stats…</span>
      </div>

      <p v-if="!filteredApps.length" class="empty-state">No forms match your search.</p>

      <ul v-else class="form-card-list" role="list">
        <li
          v-for="app in filteredApps"
          :key="app.id"
          class="form-card"
          @click="handleClickApp(app.id)"
        >
          <div class="form-card__header">
            <div>
              <div class="form-card__title">{{ app.name }}</div>
              <div class="form-card__meta">
                <span class="pill pill--muted">v{{ app.version }}</span>
                <span class="pill pill--success">active</span>
              </div>
            </div>
            <ChevronRight class="form-card__icon" />
          </div>

          <p class="form-card__description">{{ app.description }}</p>

          <div class="form-card__stats">
            <div class="stat">
              <span class="stat__label">Synced</span>
              <span class="stat__value">
                {{ appStats[app.id]?.syncedRecords ?? 0 }} records
              </span>
            </div>
            <div class="stat">
              <span class="stat__label">Pending</span>
              <span class="stat__value">
                {{ appStats[app.id]?.pendingRecords ?? 0 }}
              </span>
            </div>
            <div class="stat">
              <span class="stat__label">Forms</span>
              <span class="stat__value">{{ app.entityForms.length }}</span>
            </div>
          </div>

          <div class="form-card__footer">
            <span>{{ appStats[app.id]?.totalRecords ?? 0 }} total records</span>
          </div>
        </li>
      </ul>
    </section>

    <button class="fab" type="button" @click="toggleAddOptions" aria-label="Add FormApp">
      <svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
      </svg>
    </button>

    <div v-if="showAddOptions" class="overlay" role="dialog" aria-modal="true">
      <div class="overlay__backdrop" @click="showAddOptions = false"></div>
      <div class="overlay__panel">
        <header>
          <h3>Add FormApp</h3>
          <p>Choose how you'd like to add a new form to your collection</p>
        </header>
        <div class="overlay__options">
          <button class="option" type="button" @click="handleScanApp">
            <span class="option__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M3 5v4h2V7h2V5H3zm14 0v2h2v2h2V5h-4zM5 17v-2H3v4h4v-2H5zm14-2v2h-2v2h4v-4h-2zM7 7h10v10H7z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <span class="option__title">Scan QR Code</span>
              <span class="option__subtitle">Use your camera to scan a FormApp QR code</span>
            </div>
          </button>
          <button class="option" type="button" @click="handleEnterUrl">
            <span class="option__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M3.9 12a4 4 0 0 1 4-4H11v2H7.9a2 2 0 1 0 0 4H11v2H7.9a4 4 0 0 1-4-4zm6.1 1h4v-2h-4zm6.1-5H13V6h3.1a4 4 0 1 1 0 8H13v-2h3.1a2 2 0 1 0 0-4z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <span class="option__title">Enter URL</span>
              <span class="option__subtitle">Manually enter a FormApp download URL</span>
            </div>
          </button>
          <button class="option" type="button" @click="handleSelectFile">
            <span class="option__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M5 20h14a1 1 0 0 0 1-1V8.83a1 1 0 0 0-.29-.7l-4.84-4.84A1 1 0 0 0 14.17 3H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1zm7-14 5 5h-3v4h-4v-4H7l5-5z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <span class="option__title">Select JSON File</span>
              <span class="option__subtitle">Choose a FormApp JSON file from your device</span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <Dialog
      :open="openInputAppDialog"
      :title="'Load FormApp'"
      @update:open="openInputAppDialog = $event"
      :onSave="handleLoadAppFromInput"
    >
      <template #form-content>
        <div class="form-field">
          <label for="appUrl">FormApp URL</label>
          <input id="appUrl" type="url" v-model="appUrl" placeholder="https://example.com/app.json" />
        </div>
      </template>
    </Dialog>

    <input
      ref="filePickerRef"
      class="visually-hidden"
      type="file"
      accept="application/json"
      @change="handleFileChange"
    />

    <button
      v-if="isDevelop"
      class="dev-reset"
      type="button"
      @click="devHandleClickClearData"
    >
      Clear all data (dev)
    </button>
  </div>
</template>

<style scoped>
.home-screen {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.home-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.home-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1f2937;
}

.home-header p {
  color: #6b7280;
  font-size: 0.95rem;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #ffffff;
  border-radius: 14px;
  padding: 0.65rem 1rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.search-bar input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.95rem;
  color: #1f2937;
  background: transparent;
}

.search-bar input::placeholder {
  color: #9ca3af;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
  display: block;
  color: #9ca3af;
}

.icon path {
  fill: currentColor;
}

.forms-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-heading h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.section-hint {
  font-size: 0.85rem;
  color: #6b7280;
}

.empty-state {
  color: #6b7280;
  font-size: 0.95rem;
}

.form-card-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.form-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  transition: transform 0.2s ease;
  cursor: pointer;
}

.form-card:active {
  transform: scale(0.99);
}

.form-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.form-card__title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #111827;
}

.form-card__meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pill--muted {
  background: #eef2ff;
  color: #4c51bf;
}

.pill--success {
  background: #dcfce7;
  color: #166534;
}

.form-card__icon {
  color: #9ca3af;
  flex-shrink: 0;
}

.form-card__description {
  margin: 1rem 0 1.25rem;
  color: #6b7280;
  font-size: 0.95rem;
}

.form-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.stat {
  background: #f3f4f6;
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
}

.stat__value {
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
}

.form-card__footer {
  margin-top: 1.25rem;
  display: flex;
  justify-content: flex-end;
  font-size: 0.75rem;
  color: #9ca3af;
}

.fab {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  border: none;
  display: grid;
  place-items: center;
  box-shadow: 0 18px 40px rgba(79, 70, 229, 0.35);
  z-index: 5;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
}

.overlay__panel {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(480px, 100%);
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 1.5rem;
  box-shadow: 0 -20px 40px rgba(15, 23, 42, 0.16);
}

.overlay__panel header h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

.overlay__panel header p {
  color: #6b7280;
  margin-top: 0.5rem;
  font-size: 0.95rem;
}

.overlay__options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: none;
  background: #f9fafb;
  text-align: left;
  transition: transform 0.2s ease, background 0.2s ease;
}

.option:active {
  transform: scale(0.99);
}

.option__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.option__title {
  font-weight: 600;
  color: #1f2937;
  display: block;
}

.option__subtitle {
  display: block;
  font-size: 0.85rem;
  color: #6b7280;
  margin-top: 0.15rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-field label {
  font-size: 0.9rem;
  color: #374151;
  font-weight: 600;
}

.form-field input {
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  font-size: 0.95rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dev-reset {
  margin-top: 1rem;
  align-self: center;
  background: transparent;
  border: none;
  color: #dc2626;
  font-weight: 600;
  text-decoration: underline;
}
</style>
