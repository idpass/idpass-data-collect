<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { initStore, closeStore, store } from '@/store'
import { usePlatform } from '@/platform'
import { useBarcodeScan } from '@/composables/useBarcodeScan'
import { useSnackbar } from '@/composables/useSnackbar'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { registerIssuerKey } from '@/services/claim169Service'

interface AppStats {
  totalRecords: number
  pendingRecords: number
  syncedRecords: number
}

const router = useRouter()
const { showError, showSuccess } = useSnackbar()

const { isNative } = usePlatform()
const isMobile = isNative
const { isScanning, requestPermissions, scanBarcode, cancelScan } = useBarcodeScan()
const isGrantedPermissions = ref(false)

const database = useDatabase()
const tenantapps = ref<TenantAppData[]>([])
const appStats = ref<Record<string, AppStats>>({})
const isLoadingStats = ref(false)
const searchTerm = ref('')

const openInputAppDialog = ref(false)
const showAddOptions = ref(false)
const isLoadingApp = ref(false)
const appUrl = ref('')
const filePickerRef = ref<HTMLInputElement | null>(null)

const tenantappsDb = database.tenantapps.find()
const tenantappsSub = tenantappsDb.$.subscribe((results) => {
  tenantapps.value = results
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

const totalStats = computed(() => {
  let synced = 0, pending = 0, total = 0
  for (const stats of Object.values(appStats.value)) {
    synced += stats.syncedRecords
    pending += stats.pendingRecords
    total += stats.totalRecords
  }
  return { synced, pending, total }
})

const syncHealthPercent = computed(() => {
  if (totalStats.value.total === 0) return 100
  return Math.round((totalStats.value.synced / totalStats.value.total) * 100)
})

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

const scan = async () => {
  if (!isGrantedPermissions.value) {
    const granted = await requestPermissions()
    isGrantedPermissions.value = granted
    if (!granted) {
      throw new Error('Camera permissions are required to scan QR codes')
    }
  }

  const code = await scanBarcode({ handleBackButton: true })
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
      authConfigs: config.authConfigs,
      trustedIssuers: config.trustedIssuers,
    })
    return
  }

  await database.tenantapps.upsert({
    ...config,
    url: config.url || sourceUrl
  })
}

const loadAppFromUrl = async (url: string) => {
  try {
    const parsed = new URL(url)
    const allowedSchemes = import.meta.env.DEV ? ['https:', 'http:'] : ['https:']
    if (!allowedSchemes.includes(parsed.protocol)) {
      throw new Error(`Invalid URL scheme "${parsed.protocol}" — only ${allowedSchemes.join(', ')} allowed`)
    }

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
    showError(message)
    throw error
  }
}

const handleLoadAppFromInput = async () => {
  isLoadingApp.value = true
  try {
    const savedConfig = await loadAppFromUrl(appUrl.value)
    openInputAppDialog.value = false
    appUrl.value = ''
    showSuccess(`Successfully loaded "${savedConfig?.name || 'Collection Program'}"`)
  } catch {
    // Error already handled by loadAppFromUrl
  } finally {
    isLoadingApp.value = false
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

  isLoadingApp.value = true
  try {
    const text = await file.text()
    const json = JSON.parse(text) as TenantAppData
    await saveTenantApp(json)
    showSuccess(`Successfully imported "${json?.name || 'Collection Program'}"`)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Unable to import the selected file. Please verify it is a valid Collection Program JSON.'
    showError(message)
  } finally {
    target.value = ''
    isLoadingApp.value = false
  }
}

const handleScanApp = async () => {
  try {
    if (!isMobile.value) {
      openInputAppDialog.value = true
      showAddOptions.value = false
      return
    }

    showAddOptions.value = false

    isLoadingApp.value = true
    const url = await scan()
    const savedConfig = await loadAppFromUrl(url)

    showSuccess(`Successfully added "${savedConfig?.name || 'Collection Program'}"`)
  } catch (error) {
    if (error instanceof Error && error.message === 'Scan cancelled') return
    console.error('Error scanning QR code:', error)
    const message = error instanceof Error ? error.message : 'Unable to scan QR code. Please try again.'
    showError(message)
  } finally {
    isLoadingApp.value = false
  }
}

const handleEnterUrl = () => {
  showAddOptions.value = false
  openInputAppDialog.value = true
}

const handleClickApp = (appId: string) => {
  router.push('/app/' + appId)
}

const getCardAccentColor = (appId: string) => {
  const stats = appStats.value[appId]
  if (!stats || stats.totalRecords === 0) return 'var(--border-light, #dfe3e8)'
  if (stats.pendingRecords === 0) return 'var(--status-success, #2d8a56)'
  return 'var(--brand, #ff6d37)'
}
</script>

<template>
  <div class="home">
    <!-- Header -->
    <header class="home-header">
      <h1 class="home-title">Collection Programs</h1>
      <p class="home-subtitle" v-if="tenantapps.length">
        {{ tenantapps.length }} program{{ tenantapps.length !== 1 ? 's' : '' }}
      </p>
    </header>

    <!-- Aggregate status strip — only when there are programs with data -->
    <div v-if="tenantapps.length && totalStats.total > 0" class="status-strip">
      <div class="status-strip-bar">
        <div class="status-strip-fill" :style="{ width: syncHealthPercent + '%' }"></div>
      </div>
      <div class="status-strip-labels">
        <span class="status-strip-label">
          <span class="status-dot status-dot--synced"></span>
          {{ totalStats.synced }} synced
        </span>
        <span v-if="totalStats.pending > 0" class="status-strip-label">
          <span class="status-dot status-dot--pending"></span>
          {{ totalStats.pending }} pending
        </span>
        <span class="status-strip-label status-strip-label--muted">
          {{ totalStats.total }} total
        </span>
      </div>
    </div>

    <!-- Quick action -->
    <button class="quick-action" type="button" @click="showAddOptions = true">
      <span class="quick-action-icon quick-action-icon--primary">
        <v-icon size="20">mdi-plus</v-icon>
      </span>
      <span class="quick-action-label">Add Program</span>
    </button>

    <!-- Search — only shown with 2+ programs -->
    <div v-if="tenantapps.length >= 2" class="search-container">
      <v-icon size="18" class="search-icon">mdi-magnify</v-icon>
      <input
        v-model="searchTerm"
        type="search"
        class="search-input"
        placeholder="Search programs..."
      />
      <button
        v-if="searchTerm"
        type="button"
        class="search-clear"
        @click="searchTerm = ''"
        aria-label="Clear search"
      >
        <v-icon size="16">mdi-close</v-icon>
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoadingStats && !tenantapps.length" class="program-list">
      <div v-for="i in 3" :key="i" class="program-card program-card--skeleton">
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--subtitle"></div>
        <div class="skeleton-line skeleton-line--stats"></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!filteredApps.length && !searchTerm" class="empty-state">
      <div class="empty-state-visual">
        <svg class="empty-state-illustration" viewBox="0 0 120 120" fill="none">
          <rect x="20" y="30" width="80" height="60" rx="8" stroke="var(--brand, #ff6d37)" stroke-width="2" stroke-dasharray="6 4" opacity="0.4" />
          <rect x="30" y="40" width="60" height="16" rx="4" fill="var(--brand, #ff6d37)" opacity="0.08" />
          <rect x="30" y="62" width="40" height="8" rx="3" fill="var(--brand, #ff6d37)" opacity="0.12" />
          <rect x="30" y="74" width="52" height="8" rx="3" fill="var(--brand, #ff6d37)" opacity="0.06" />
          <circle cx="90" cy="78" r="18" fill="var(--brand, #ff6d37)" opacity="0.1" />
          <path d="M85 78h10M90 73v10" stroke="var(--brand, #ff6d37)" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </div>
      <h2 class="empty-state-title">No programs yet</h2>
      <p class="empty-state-text">
        Add a Collection Program to start gathering data in the field.
      </p>
      <button class="empty-state-cta" type="button" @click="showAddOptions = true">
        <v-icon size="20" class="mr-2">mdi-plus</v-icon>
        Add your first program
      </button>
    </div>

    <!-- Search empty -->
    <div v-else-if="!filteredApps.length && searchTerm" class="empty-state">
      <v-icon size="40" color="medium-emphasis" class="mb-3">mdi-magnify</v-icon>
      <h2 class="empty-state-title">No matches</h2>
      <p class="empty-state-text">No programs match "{{ searchTerm }}"</p>
    </div>

    <!-- Program list -->
    <div v-else class="program-list">
      <article
        v-for="(app, index) in filteredApps"
        :key="app.id"
        class="program-card"
        :style="{
          '--accent': getCardAccentColor(app.id),
          'animation-delay': (index * 40) + 'ms'
        }"
        @click="handleClickApp(app.id)"
      >
        <div class="program-card-accent"></div>
        <div class="program-card-body">
          <div class="program-card-top">
            <div class="program-card-info">
              <h3 class="program-card-name">{{ app.name }}</h3>
              <p v-if="app.description" class="program-card-desc">{{ app.description }}</p>
            </div>
            <v-icon size="20" color="medium-emphasis" class="program-card-chevron">mdi-chevron-right</v-icon>
          </div>
          <div class="program-card-footer">
            <span class="program-card-stat">
              <v-icon size="14" color="success">mdi-check-circle</v-icon>
              {{ appStats[app.id]?.syncedRecords ?? 0 }}
            </span>
            <span v-if="(appStats[app.id]?.pendingRecords ?? 0) > 0" class="program-card-stat program-card-stat--pending">
              <v-icon size="14" color="secondary">mdi-cloud-upload-outline</v-icon>
              {{ appStats[app.id]?.pendingRecords ?? 0 }}
            </span>
            <span class="program-card-stat program-card-stat--muted">
              <v-icon size="14">mdi-file-document-outline</v-icon>
              {{ app.entityForms.length }} forms
            </span>
            <span class="program-card-version">v{{ app.version }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- FAB — only when scrolling through programs -->
    <button
      v-if="filteredApps.length"
      class="fab"
      type="button"
      @click="showAddOptions = true"
      aria-label="Add Collection Program"
    >
      <v-icon size="24">mdi-plus</v-icon>
    </button>

    <!-- Bottom sheet: add options -->
    <v-bottom-sheet v-model="showAddOptions">
      <v-card rounded="t-lg">
        <div class="sheet-handle"></div>
        <v-card-title class="pt-2">Add Program</v-card-title>
        <v-list nav class="pb-4">
          <v-list-item
            v-if="isMobile"
            prepend-icon="mdi-qrcode-scan"
            title="Scan QR Code"
            subtitle="Scan a program configuration QR"
            :disabled="isLoadingApp"
            @click="handleScanApp"
          />
          <v-list-item
            prepend-icon="mdi-link"
            title="Enter URL"
            subtitle="Load from a download URL"
            :disabled="isLoadingApp"
            @click="handleEnterUrl"
          />
          <v-list-item
            prepend-icon="mdi-file-upload-outline"
            title="Import JSON File"
            subtitle="Select a file from your device"
            :disabled="isLoadingApp"
            @click="handleSelectFile"
          />
        </v-list>
      </v-card>
    </v-bottom-sheet>

    <!-- Dialog: URL input -->
    <v-dialog v-model="openInputAppDialog" max-width="400">
      <v-card rounded="lg">
        <v-card-title>Load Program</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="appUrl"
            label="Program URL"
            type="url"
            placeholder="https://example.com/config.json"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="openInputAppDialog = false">Cancel</v-btn>
          <v-btn color="secondary" variant="flat" :loading="isLoadingApp" :disabled="isLoadingApp" @click="handleLoadAppFromInput">Load</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Hidden file picker -->
    <input
      ref="filePickerRef"
      class="visually-hidden"
      type="file"
      accept="application/json"
      @change="handleFileChange"
    />

    <!-- Scanner overlay — MUST keep barcode-scanner-modal class for native camera transparency -->
    <div v-if="isScanning" class="scanner-overlay barcode-scanner-modal">
      <div class="scan-frame">
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>
        <div class="scan-line"></div>
      </div>
      <p class="scan-hint">Align QR code within frame</p>
      <button class="cancel-scan-button" type="button" @click="cancelScan()">
        Cancel
      </button>
    </div>

  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  padding: 20px 16px 100px;
  gap: 16px;
}

/* ── Header ── */

.home-header {
  padding: 4px 0 0;
}

.home-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main, #1a202c);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.home-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}

/* ── Sync status strip ── */

.status-strip {
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 12px;
  padding: 12px 14px;
}

.status-strip-bar {
  height: 4px;
  background: var(--neutral-100, #dfe3e8);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.status-strip-fill {
  height: 100%;
  background: var(--status-success, #2d8a56);
  border-radius: 2px;
  transition: width 0.6s ease;
}

.status-strip-labels {
  display: flex;
  gap: 12px;
  align-items: center;
}

.status-strip-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-main, #1a202c);
}

.status-strip-label--muted {
  margin-left: auto;
  color: var(--text-muted, #64748b);
  font-weight: 400;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot--synced {
  background: var(--status-success, #2d8a56);
}

.status-dot--pending {
  background: var(--brand, #ff6d37);
}

/* ── Quick action ── */

.quick-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.quick-action:active {
  background: var(--neutral-50, #f8f9fa);
  border-color: var(--border-default, #c4cdd5);
}

.quick-action-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quick-action-icon--primary {
  background: var(--brand, #ff6d37);
  color: #fff;
}

.quick-action-icon--subtle {
  background: var(--neutral-100, #dfe3e8);
  color: var(--primary, #2c3e50);
}

.quick-action-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main, #1a202c);
}

/* ── Search ── */

.search-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--neutral-50, #f8f9fa);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 12px;
  height: 40px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.search-container:focus-within {
  border-color: var(--brand, #ff6d37);
  background: var(--surface, #fff);
}

.search-icon {
  color: var(--text-muted, #64748b);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.875rem;
  color: var(--text-main, #1a202c);
  font-family: inherit;
  min-height: 40px;
}

.search-input::placeholder {
  color: var(--text-muted, #64748b);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--neutral-200, #c4cdd5);
  color: var(--surface, #fff);
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Program cards ── */

.program-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.program-card {
  display: flex;
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
  animation: cardIn 0.3s ease both;
}

.program-card:active {
  transform: scale(0.985);
  border-color: var(--border-default, #c4cdd5);
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.program-card-accent {
  width: 4px;
  background: var(--accent, var(--border-light));
  flex-shrink: 0;
  border-radius: 4px 0 0 4px;
}

.program-card-body {
  flex: 1;
  padding: 14px 14px 12px 12px;
  min-width: 0;
}

.program-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.program-card-info {
  flex: 1;
  min-width: 0;
}

.program-card-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main, #1a202c);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.program-card-desc {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin-top: 2px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.program-card-chevron {
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.4;
}

.program-card-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-light, #dfe3e8);
}

.program-card-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-main, #1a202c);
}

.program-card-stat--pending {
  color: var(--brand, #ff6d37);
}

.program-card-stat--muted {
  color: var(--text-muted, #64748b);
  font-weight: 400;
}

.program-card-version {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted, #64748b);
  background: var(--neutral-50, #f8f9fa);
  padding: 2px 7px;
  border-radius: 6px;
}

/* ── Skeleton ── */

.program-card--skeleton {
  padding: 16px;
  cursor: default;
}

.program-card--skeleton:active {
  transform: none;
}

.skeleton-line {
  background: linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-50) 50%, var(--neutral-100) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease infinite;
  border-radius: 6px;
}

.skeleton-line--title {
  width: 60%;
  height: 14px;
  margin-bottom: 8px;
}

.skeleton-line--subtitle {
  width: 85%;
  height: 10px;
  margin-bottom: 12px;
}

.skeleton-line--stats {
  width: 70%;
  height: 10px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Empty state ── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 24px 20px;
}

.empty-state-visual {
  margin-bottom: 8px;
}

.empty-state-illustration {
  width: 120px;
  height: 120px;
}

.empty-state-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main, #1a202c);
  margin-bottom: 6px;
}

.empty-state-text {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
  line-height: 1.5;
  max-width: 240px;
  margin-bottom: 24px;
}

.empty-state-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  background: var(--brand, #ff6d37);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
  min-height: 48px;
}

.empty-state-cta:active {
  opacity: 0.85;
}

/* ── FAB ── */

.fab {
  position: fixed;
  right: 20px;
  bottom: 84px;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: var(--brand, #ff6d37);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 12px rgba(255, 109, 55, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  z-index: 5;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.fab:active {
  transform: scale(0.92);
  box-shadow:
    0 2px 6px rgba(255, 109, 55, 0.25),
    0 1px 2px rgba(0, 0, 0, 0.06);
}

/* ── Bottom sheet handle ── */

.sheet-handle {
  width: 32px;
  height: 4px;
  border-radius: 2px;
  background: var(--neutral-200, #c4cdd5);
  margin: 10px auto 0;
}

/* ── Utility ── */

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

/* ── Scanner overlay — MUST remain unchanged for native camera transparency ── */

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
  font-size: 1rem;
  margin-top: 1.5rem;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.cancel-scan-button {
  margin-top: 1.5rem;
  padding: 0.75rem 2rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  min-height: 48px;
}
</style>
