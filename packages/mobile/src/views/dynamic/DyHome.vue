<script setup lang="ts">
import ChevronRight from '@/components/icons/ChevronRight.vue'
import Dialog from '@/components/SaveDialog.vue'
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { initStore, closeStore, store } from '@/store'
import { Barcode, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { registerIssuerKey } from '@/services/claim169Service'
import { SecureStorageService } from '@/services/SecureStorageService'

interface AppStats {
  totalRecords: number
  pendingRecords: number
  syncedRecords: number
}

const router = useRouter()

const isMobile = ref(['android', 'ios'].includes(Capacitor.getPlatform()))
const isGrantedPermissions = ref(false)
const isScanning = ref(false)
let cancelScan: (() => void) | null = null
const isDevelop = import.meta.env.VITE_DEVELOP === 'true'

const database = useDatabase()
const tenantapps = ref<TenantAppData[]>([])
const appStats = ref<Record<string, AppStats>>({})
const isLoadingStats = ref(false)
const searchTerm = ref('')
const { isOffline } = useNetworkStatus()

const openInputAppDialog = ref(false)
const showAddOptions = ref(false)
const appUrl = ref('')
const filePickerRef = ref<HTMLInputElement | null>(null)
const errorMessage = ref('')
const showError = ref(false)
const isSuccessMessage = ref(false)

const tenantappsDb = database.tenantapps.find()
const tenantappsSub = tenantappsDb.$.subscribe((results) => {
  tenantapps.value = results
  // Register trusted issuers from all tenant apps
  results.forEach(app => {
    if (app.trustedIssuers) {
      app.trustedIssuers.forEach(issuer => {
        registerIssuerKey(issuer.issuerId, issuer.publicKey)
      })
    }
  })
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
  // Also clear native secure storage so the DB encryption key is reset alongside
  // the data. Without this, a stale key in secure storage would cause a DB1
  // password mismatch on the next launch.
  await SecureStorageService.clear()
  window.location.reload()
}

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
}

const scanSingleBarcode = (): Promise<Barcode> => {
  return new Promise((resolve, reject) => {
    document.querySelector('body')?.classList.add('barcode-scanner-active')
    isScanning.value = true
    let activeListener: { remove: () => Promise<void> } | null = null
    let backButtonListener: { remove: () => Promise<void> } | null = null

    const cleanup = async () => {
      isScanning.value = false
      cancelScan = null
      document.querySelector('body')?.classList.remove('barcode-scanner-active')
      await BarcodeScanner.stopScan().catch(() => {})
      if (activeListener) {
        await activeListener.remove().catch(() => {})
        activeListener = null
      }
      if (backButtonListener) {
        await backButtonListener.remove().catch(() => {})
        backButtonListener = null
      }
    }

    cancelScan = async () => {
      await cleanup()
      reject(new Error('Scan cancelled'))
    }

    // Listen for hardware back button
    CapApp.addListener('backButton', async () => {
      await cleanup()
      reject(new Error('Scan cancelled'))
    }).then((listener) => {
      backButtonListener = listener
    })

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
      throw new Error('Camera permissions are required to scan QR codes')
    }
  }

  const code = await scanSingleBarcode()
  const url = code.displayValue
  
  if (!url) {
    throw new Error('QR code did not contain a valid URL')
  }
  
  return url
}

const parseVersion = (version: string | undefined): number[] => {
  if (!version) return [0]
  return version.split('.').map((part) => parseInt(part, 10) || 0)
}

const isNewerVersion = (incoming: string | undefined, existing: string | undefined): boolean => {
  const incomingParts = parseVersion(incoming)
  const existingParts = parseVersion(existing)
  const length = Math.max(incomingParts.length, existingParts.length)
  for (let i = 0; i < length; i++) {
    const a = incomingParts[i] ?? 0
    const b = existingParts[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

const saveTenantApp = async (config: TenantAppData, sourceUrl = '') => {
  if (!config?.id || !config?.name || !config?.entityForms) {
    throw new Error('Invalid Collection Program configuration: missing required fields')
  }

  const [existingById, existingByName] = await Promise.all([
    database.tenantapps.find({ selector: { id: config.id } }).exec(),
    database.tenantapps.find({ selector: { name: config.name } }).exec(),
  ])

  const existing = existingById[0] ?? existingByName[0] ?? null

  if (existing) {
    if (!isNewerVersion(config.version, existing.version)) {
      throw new Error(
        `"${existing.name}" is already at version ${existing.version ?? '(unknown)'}. ` +
        `The incoming version ${config.version ?? '(unknown)'} is not newer.`
      )
    }

    // Update only config fields — entities are stored separately and are unaffected
    await existing.patch({
      id: config.id,
      name: config.name,
      description: config.description,
      version: config.version,
      url: config.url || sourceUrl || existing.url,
      entityForms: config.entityForms,
      entityData: config.entityData,
      syncServerUrl: config.syncServerUrl,
      externalSync: config.externalSync,
      trustedIssuers: config.trustedIssuers,
    })
    return
  }

  await database.tenantapps.upsert({
    ...config,
    url: config.url || sourceUrl
  })
}

const displayError = (message: string, duration = 5000, isSuccess = false) => {
  errorMessage.value = message
  isSuccessMessage.value = isSuccess
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
    isSuccessMessage.value = false
  }, duration)
}

const loadAppFromUrl = async (url: string) => {
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to load configuration: ${response.status} ${response.statusText}`)
    }
    
    const json = await response.json()
    await saveTenantApp(json, url)
    
    return json
  } catch (error) {
    console.error('Error loading app:', error)
    const message = error instanceof Error ? error.message : 'Error loading app configuration. Please try again.'
    displayError(message)
    throw error // Re-throw so caller can handle it
  }
}

const handleLoadAppFromInput = async () => {
  try {
    const savedConfig = await loadAppFromUrl(appUrl.value)
    openInputAppDialog.value = false
    appUrl.value = ''
    displayError(`Successfully loaded "${savedConfig?.name || 'Collection Program'}"`, 3000, true)
  } catch {
    // Error already handled by loadAppFromUrl via displayError
    // Keep dialog open so user can fix the URL
  }
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
    const json = JSON.parse(text) as TenantAppData
    await saveTenantApp(json)
    displayError(`Successfully imported "${json?.name || 'Collection Program'}"`, 3000, true)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Unable to import the selected file. Please verify it is a valid Collection Program JSON.'
    displayError(message)
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

    // Close bottom sheet before scanning to avoid UI conflicts
    showAddOptions.value = false
    
    const url = await scan()
    
    if (!url) {
      throw new Error('No URL found in scanned QR code')
    }
    
    const savedConfig = await loadAppFromUrl(url)
    
    // Show success feedback
    displayError(`Successfully added "${savedConfig?.name || 'Collection Program'}"`, 3000, true)
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Scan cancelled') return
    console.error('Error scanning QR code:', error)
    const message = error instanceof Error ? error.message : 'Unable to scan QR code. Please try again.'
    displayError(message)
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

const handleScanIdentity = () => {
  showAddOptions.value = false
  router.push({ name: 'scan-claim169' })
}
</script>

<template>
  <div class="home-screen">
    <div v-if="showError" :class="['error-message', { 'success-message': isSuccessMessage }]">
      <svg v-if="!isSuccessMessage" class="error-icon" viewBox="0 0 24 24" focusable="false">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
          fill="currentColor"
        />
      </svg>
      <svg v-else class="error-icon" viewBox="0 0 24 24" focusable="false">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
          fill="currentColor"
        />
      </svg>
      <span>{{ errorMessage }}</span>
      <button class="error-close" type="button" @click="showError = false" aria-label="Close message">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <header class="home-header">
      <div>
        <h1>Collection Programs</h1>
        <p>{{ availableCount }} programs available</p>
      </div>
      <div class="search-bar">
        <svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path
              d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.71.71l.27.28v.79l5 4.99L20.49 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"
              fill="currentColor"
            />
          </svg>
        <input v-model="searchTerm" type="search" placeholder="Search programs..." />
      </div>
    </header>

    <section class="forms-section" aria-labelledby="your-forms">
      <div class="section-heading">
        <h2 id="your-forms">Your Programs</h2>
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
              <span class="stat__label">
                Pending
                <span v-if="isOffline && (appStats[app.id]?.pendingRecords ?? 0) > 0" class="stat__label-hint" title="Will sync when online">
                  (offline)
                </span>
              </span>
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

    <button class="fab" type="button" @click="toggleAddOptions" aria-label="Add Collection Program">
      <svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
      </svg>
    </button>

    <div v-if="showAddOptions" class="overlay" role="dialog" aria-modal="true">
      <div class="overlay__backdrop" @click="showAddOptions = false"></div>
      <div class="overlay__panel">
        <header>
          <h3>Add Collection Program</h3>
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
              <span class="option__subtitle">Use your camera to scan a Collection Program QR code</span>
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
              <span class="option__subtitle">Manually enter a Collection Program download URL</span>
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
              <span class="option__subtitle">Choose a Collection Program JSON file from your device</span>
            </div>
          </button>

          <div class="options-divider">
            <span>or verify identity</span>
          </div>

          <button class="option option--identity" type="button" @click="handleScanIdentity">
            <span class="option__icon option__icon--identity" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <span class="option__title">Scan Identity QR</span>
              <span class="option__subtitle">Verify a Claim-169 identity QR code from MOSIP Inji</span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <Dialog
      :open="openInputAppDialog"
      :title="'Load Collection Program'"
      @update:open="openInputAppDialog = $event"
      :onSave="handleLoadAppFromInput"
    >
      <template #form-content>
        <div class="form-field">
          <label for="appUrl">Collection Program URL</label>
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

    <!-- Scanner overlay with cancel button (visible while camera is active) -->
    <div v-if="isScanning" class="scanner-overlay barcode-scanner-modal">
      <div class="scan-frame">
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>
        <div class="scan-line"></div>
      </div>
      <p class="scan-hint">Align QR code within frame</p>
      <button class="cancel-scan-button" type="button" @click="cancelScan?.()">
        Cancel
      </button>
    </div>

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
  gap: var(--spacing-lg);
}

.home-header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md)
}

.home-header h1 {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--text-main);
}

.home-header p {
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  box-shadow: none;
  border: 1px solid var(--border-light);
  min-height: var(--touch-target);
}

.search-bar input {
  flex: 1;
  border: none;
  outline: none;
  font-size: var(--font-size-base);
  color: var(--text-main);
  background: transparent;
  font-family: var(--font-family);
}

.search-bar input::placeholder {
  color: var(--text-muted);
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
  display: block;
  color: var(--text-muted);
}

.icon path {
  fill: currentColor;
}

.forms-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
}

.section-heading h2 {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-main);
}

.section-hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.empty-state {
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

.form-card-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
  background: var(--surface);
  border-top: 1px solid var(--border-light);
}

.form-card {
  background: var(--surface);
  border-radius: 0;
  padding: var(--spacing-md) var(--spacing-md);
  border: none;
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
  cursor: pointer;
}

.form-card:active {
  background: var(--neutral-50);
}

.form-card:hover {
  background: var(--neutral-50);
}

.form-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-md);
}

.form-card__title {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-main);
}

.form-card__meta {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pill--muted {
  background: var(--brand-100);
  color: var(--brand-dark);
}

.pill--success {
  background: var(--status-success-light);
  color: var(--status-success);
}

.form-card__icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.form-card__description {
  margin: var(--spacing-md) 0 var(--spacing-lg);
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

.form-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.stat {
  background: transparent;
  border-radius: 0;
  padding: var(--spacing-sm) 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.stat__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.stat__label-hint {
  font-size: var(--font-size-xs);
  font-weight: 400;
  color: var(--status-warning);
}

.stat__value {
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-main);
}

.form-card__footer {
  margin-top: var(--spacing-lg);
  display: flex;
  justify-content: flex-end;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.fab {
  position: fixed;
  right: var(--spacing-lg);
  bottom: var(--spacing-lg);
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--brand);
  color: #ffffff;
  border: none;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-floating);
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
  background: rgba(26, 32, 44, 0.4);
}

.overlay__panel {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(480px, 100%);
  max-height: 85vh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-modal);
}

.overlay__panel header h3 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text-main);
}

.overlay__panel header p {
  color: var(--text-muted);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-base);
}

.overlay__options {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: var(--spacing-lg);
  border-top: 1px solid var(--border-light);
}

.option {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface);
  text-align: left;
  transition: background var(--transition-fast);
  min-height: var(--touch-target);
}

.option:active {
  background: var(--neutral-50);
}

.option__icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: var(--brand-100);
  color: var(--brand-dark);
}

.option__title {
  font-weight: 600;
  color: var(--text-main);
  display: block;
}

.option__subtitle {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-field label {
  font-size: var(--font-size-sm);
  color: var(--text-main);
  font-weight: 600;
}

.form-field input {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  font-size: var(--font-size-base);
  min-height: var(--touch-target);
  font-family: var(--font-family);
}

.form-field input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
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
  margin-top: var(--spacing-md);
  align-self: center;
  background: transparent;
  border: none;
  color: var(--status-danger);
  font-weight: 600;
  text-decoration: underline;
  min-height: var(--touch-target);
}

.error-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--status-danger-light);
  border: 1px solid var(--status-danger);
  border-radius: var(--radius-xl);
  color: var(--status-danger);
  font-size: var(--font-size-base);
  box-shadow: var(--shadow-subtle);
}

.success-message {
  background: var(--status-success-light);
  border: 1px solid var(--status-success);
  color: var(--status-success);
}

.success-message .error-icon {
  color: var(--status-success);
}

.success-message .error-close {
  color: var(--status-success);
}

.success-message .error-close:hover {
  background: rgba(45, 138, 86, 0.1);
}

.error-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--status-danger);
}

.error-message span {
  flex: 1;
}

.error-close {
  background: transparent;
  border: none;
  padding: var(--spacing-xs);
  cursor: pointer;
  color: var(--status-danger);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
  min-width: var(--touch-target);
  min-height: var(--touch-target);
}

.error-close:hover {
  background: rgba(229, 62, 62, 0.1);
}

.error-close svg {
  width: 18px;
  height: 18px;
}

.scanner-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  z-index: 100;
}

.scan-frame {
  position: relative;
  width: 280px;
  height: 280px;
}

.corner {
  position: absolute;
  width: 40px;
  height: 40px;
  border: 4px solid var(--brand, #ff6d37);
}

.corner.top-left { top: 0; left: 0; border-right: none; border-bottom: none; border-radius: 8px 0 0 0; }
.corner.top-right { top: 0; right: 0; border-left: none; border-bottom: none; border-radius: 0 8px 0 0; }
.corner.bottom-left { bottom: 0; left: 0; border-right: none; border-top: none; border-radius: 0 0 0 8px; }
.corner.bottom-right { bottom: 0; right: 0; border-left: none; border-top: none; border-radius: 0 0 8px 0; }

.scan-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--brand, #ff6d37), transparent);
  animation: scan 2s ease-in-out infinite;
}

@keyframes scan {
  0%, 100% { top: 10px; }
  50% { top: calc(100% - 10px); }
}

.scan-hint {
  color: white;
  font-size: var(--font-size-base);
  margin-top: var(--spacing-lg);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.cancel-scan-button {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-xl);
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-base);
  font-weight: 600;
  min-height: var(--touch-target);
}

.options-divider {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin: var(--spacing-sm) 0;
}

.options-divider::before,
.options-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-light);
}

.options-divider span {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.option--identity {
  background: rgba(44, 62, 80, 0.03);
}

.option__icon--identity {
  background: rgba(44, 62, 80, 0.12);
  color: var(--primary);
}
</style>
