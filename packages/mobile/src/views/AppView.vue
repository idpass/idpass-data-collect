<script setup lang="ts">
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { EntityForm } from '@/utils/formIoUtils'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTenantStore } from '@/store/tenant'
import { isOnline, onNetworkChange } from '@/utils/networkUtils'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSnackbar } from '@/composables/useSnackbar'
import { useSyncService } from '@/store/syncService'
import SyncScopeBadge from '@/components/SyncScopeBadge.vue'
import EntityTypeFilter, { type EntityTypeChip } from '@/components/EntityTypeFilter.vue'
import NewEntitySheet, { type NewEntityFormOption } from '@/components/NewEntitySheet.vue'
import {
  useEntitySubmissions,
  type SubmissionRecord,
  type SubmissionStatus,
} from '@/composables/useEntitySubmissions'
import { Claim169ScannerService } from '@/services/Claim169ScannerService'
import { registerIssuerKey } from '@/services/claim169Service'

const route = useRoute()
const router = useRouter()

const tenantapp = ref<TenantAppData>()
const topLevelForms = ref<EntityForm[]>([])
const isOffline = ref(false)
const tenantStore = useTenantStore()
const syncService = useSyncService()
const { submissions: allSubmissions, load: loadAllSubmissions } = useEntitySubmissions()
let networkCleanup: (() => void) | null = null
const { showError, showSuccess } = useSnackbar()
const { handleError, handleAuthError } = useErrorHandler(route.params.id as string)

const searchTerm = ref('')
const activeFilter = ref<string>('all')
const showNewSheet = ref(false)

const appId = computed(() => route.params.id as string)

const statsSummary = computed(() => ({
  synced: syncService.syncedCount,
  pending: syncService.pendingCount,
  total: syncService.totalEntities,
}))

const syncWithErrorHandling = async (): Promise<boolean> => {
  const success = await syncService.startSync(appId.value)
  if (!success && syncService.lastSyncError) {
    const errorResult = await handleError(new Error(syncService.lastSyncError), appId.value)
    if (errorResult.handled) {
      showError(errorResult.message)
    }
  }
  return success
}

onMounted(async () => {
  isOffline.value = !(await isOnline())

  networkCleanup = onNetworkChange((online) => {
    isOffline.value = !online
    if (online && !syncService.isSynced) {
      syncWithErrorHandling()
    }
  })

  const tenant = await tenantStore.getTenant(appId.value)
  tenantapp.value = tenant
  topLevelForms.value = tenantapp.value.entityForms.filter((entity) => !entity.dependsOn)

  await loadAllSubmissions()
  await syncService.refreshCounts()

  if (!isOffline.value) {
    await syncWithErrorHandling()
    // Re-load submissions after the post-mount sync so the list reflects any
    // server-side updates without the user having to pull-to-refresh.
    await loadAllSubmissions()
  }
})

onUnmounted(() => {
  if (networkCleanup) {
    networkCleanup()
  }
})

const onLogout = async () => {
  await handleAuthError(appId.value)
}

const onSync = async () => {
  if (isOffline.value) {
    showError('Sync requires an online connection. Please check your network and try again.')
    return
  }
  const ok = await syncWithErrorHandling()
  if (ok) {
    await loadAllSubmissions()
    showSuccess('Sync completed successfully!')
  }
}

const formattedVersion = computed(() => `v${tenantapp.value?.version ?? '—'}`)

const statusLabel = computed(() => {
  if (isOffline.value) return 'Offline mode'
  if (syncService.isSyncing) return 'Syncing...'
  if (syncService.isSynced) return 'Synced'
  return 'Pending sync'
})

const statusColor = computed(() => {
  if (isOffline.value) return 'warning'
  if (syncService.isSynced) return 'success'
  return 'info'
})

const stats = computed(() => [
  { label: 'Synced', value: statsSummary.value.synced, hint: 'records available', color: 'success' },
  { label: 'Pending', value: statsSummary.value.pending, hint: 'waiting to sync', color: 'warning' },
  { label: 'Records', value: allSubmissions.value.length, hint: 'collected so far', color: 'info' },
])

const formByName = computed(
  () => new Map((tenantapp.value?.entityForms ?? []).map((f) => [f.name, f])),
)

const resolveForm = (record: SubmissionRecord): EntityForm | undefined => {
  const entityName = record.modified.data.entityName as string | undefined
  if (entityName) {
    const exact = formByName.value.get(entityName)
    if (exact) return exact
    const lower = entityName.toLowerCase()
    for (const f of tenantapp.value?.entityForms ?? []) {
      if (
        f.name.toLowerCase() === lower ||
        f.name.includes(entityName) ||
        entityName.includes(f.name)
      ) {
        return f
      }
    }
  }
  const t = record.modified.type
  if (t) {
    for (const f of tenantapp.value?.entityForms ?? []) {
      if (f.entityType === t) return f
    }
  }
  return undefined
}

const parentByGuid = computed(() => {
  const map = new Map<string, SubmissionRecord>()
  for (const r of allSubmissions.value) {
    map.set(r.guid, r)
  }
  return map
})

const detailPath = (record: SubmissionRecord): string => {
  const form = resolveForm(record)
  if (!form) return ''
  const parentGuid = record.modified.data.parentGuid as string | undefined
  if (parentGuid) {
    const parent = parentByGuid.value.get(parentGuid)
    const parentForm = parent ? resolveForm(parent) : undefined
    if (parent && parentForm) {
      return `/app/${appId.value}/${parentForm.name}/${parent.guid}/${form.name}/${record.guid}/detail`
    }
  }
  return `/app/${appId.value}/${form.name}/${record.guid}/detail`
}

const submissionsWithForm = computed(() =>
  allSubmissions.value.map((record) => {
    const form = resolveForm(record)
    return {
      record,
      formName: form?.name ?? '',
      formTitle: form?.title ?? 'Unknown',
    }
  }),
)

const chipCounts = computed(() => {
  const map = new Map<string, number>()
  for (const entry of submissionsWithForm.value) {
    if (!entry.formName) continue
    map.set(entry.formName, (map.get(entry.formName) ?? 0) + 1)
  }
  return map
})

const filterChips = computed<EntityTypeChip[]>(() => {
  const chips: EntityTypeChip[] = [
    { value: 'all', label: 'All', count: submissionsWithForm.value.length },
  ]
  for (const f of tenantapp.value?.entityForms ?? []) {
    const count = chipCounts.value.get(f.name) ?? 0
    if (count === 0) continue
    chips.push({ value: f.name, label: f.title || f.name, count })
  }
  return chips
})

const filteredEntries = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  return submissionsWithForm.value.filter((entry) => {
    if (activeFilter.value !== 'all' && entry.formName !== activeFilter.value) return false
    if (!term) return true
    const data = entry.record.modified.data
    const name = (
      (data._displayName || data.name || entry.record.modified.name || '') as string
    ).toLowerCase()
    if (name.includes(term)) return true
    return JSON.stringify(data).toLowerCase().includes(term)
  })
})

const newFormOptions = computed<NewEntityFormOption[]>(() =>
  topLevelForms.value.map((f) => ({
    name: f.name,
    title: f.title || f.name,
    description: f.description,
  })),
)

const statusConfig = (status: SubmissionStatus) => {
  switch (status) {
    case 'synced':
      return { label: 'Synced', color: 'success', icon: 'mdi-check-circle' }
    case 'pending':
      return { label: 'Pending', color: 'info', icon: 'mdi-cloud-upload' }
    case 'draft':
      return { label: 'Draft', color: 'warning', icon: 'mdi-note-outline' }
    default:
      return { label: 'Unknown', color: 'default', icon: 'mdi-help-circle' }
  }
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '—'
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

const onOpenDetail = (record: SubmissionRecord) => {
  const path = detailPath(record)
  if (!path) return
  router.push(path)
}

const onPickNewForm = (form: NewEntityFormOption) => {
  router.push(`/app/${appId.value}/${form.name}/new`)
}

// Walks form components (depth-first) for a Claim-169 scanner config so the
// quick-scan search uses the same trusted issuers as the in-form scanner.
// Returns an empty list when no claim169Scanner component is configured —
// the scan call still works (skips signature verification), but a field-agent
// scanning an unsigned QR will get the unverified flag back in the result.
type Claim169IssuerCfg = {
  issuerId?: string
  ed25519Key?: string
  es256Key?: string
  publicKey?: { ed25519?: string; es256?: string }
}
const findScannerTrustedIssuers = (): Claim169IssuerCfg[] => {
  const walk = (components: unknown[]): Claim169IssuerCfg[] | null => {
    for (const c of components) {
      if (!c || typeof c !== 'object') continue
      const node = c as { type?: string; trustedIssuers?: unknown; components?: unknown[] }
      if (node.type === 'claim169Scanner' && Array.isArray(node.trustedIssuers)) {
        return node.trustedIssuers as Claim169IssuerCfg[]
      }
      if (Array.isArray(node.components)) {
        const found = walk(node.components)
        if (found) return found
      }
    }
    return null
  }
  for (const form of tenantapp.value?.entityForms ?? []) {
    const components = (form.formio as { components?: unknown[] } | undefined)?.components
    if (!Array.isArray(components)) continue
    const found = walk(components)
    if (found) return found
  }
  return []
}

const onQuickScan = async () => {
  if (!tenantapp.value) return
  const rawIssuers = findScannerTrustedIssuers()
  const trustedIssuers = rawIssuers
    .filter((i) => !!i.issuerId)
    .map((i) => ({
      issuerId: i.issuerId as string,
      ed25519Key: i.ed25519Key || i.publicKey?.ed25519,
      es256Key: i.es256Key || i.publicKey?.es256,
    }))
  // Register keys so decode-time signature verification can resolve the
  // issuer — mirrors what the in-form scanner does on its first scan.
  for (const iss of trustedIssuers) {
    registerIssuerKey(iss.issuerId, { ed25519: iss.ed25519Key, es256: iss.es256Key })
  }

  const result = await Claim169ScannerService.scan({
    title: 'Scan to find individual',
    description: 'Point the camera at a Claim-169 QR to verify identity and jump to the record.',
    trustedIssuers,
  })
  if (!result) return // user cancelled

  if (!result.isVerified) {
    showError('Signature did not verify against trusted issuers — refusing to act on this QR.')
    return
  }

  const subjectId = result.identity?.id
  if (!subjectId) {
    showError('Scanned credential has no subject id.')
    return
  }

  const subjectLower = subjectId.toLowerCase()
  const match = allSubmissions.value.find((r) => {
    const data = r.modified.data as Record<string, unknown>
    return (
      (typeof data.national_id === 'string' && data.national_id === subjectId) ||
      (typeof data.uin === 'string' && data.uin === subjectId) ||
      (typeof data.externalId === 'string' && data.externalId === subjectId) ||
      (typeof r.modified.name === 'string' && r.modified.name.toLowerCase() === subjectLower)
    )
  })

  if (match) {
    const path = detailPath(match)
    if (path) {
      showSuccess(`Identity verified — opening ${match.modified.name ?? 'record'}`)
      router.push(path)
      return
    }
  }
  // No local hit: drop the id into the search box so the agent sees an empty
  // list and can choose to create a new record via the FAB.
  searchTerm.value = subjectId
  showError(`No matching record found for ${subjectId}. Showing search results.`)
}

// Reset filter when the chip is no longer represented (e.g., after deletion).
watch(filterChips, (chips) => {
  if (chips.some((c) => c.value === activeFilter.value)) return
  activeFilter.value = 'all'
})
</script>

<template>
  <v-container v-if="tenantapp" fluid class="pa-4 app-view">
    <div class="d-flex justify-end align-center mb-4">
      <div class="d-flex ga-2">
        <v-btn
          prepend-icon="mdi-sync"
          color="secondary"
          variant="flat"
          size="small"
          :disabled="syncService.isSyncing || isOffline"
          :loading="syncService.isSyncing"
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
        <div class="mt-3 d-flex flex-wrap ga-2">
          <v-chip
            size="small"
            :color="statusColor"
            variant="tonal"
            :prepend-icon="
              isOffline
                ? 'mdi-wifi-off'
                : syncService.isSynced
                ? 'mdi-check-circle'
                : 'mdi-sync'
            "
          >
            {{ statusLabel }}
          </v-chip>
          <SyncScopeBadge :app-id="appId" />
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

    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        v-model="searchTerm"
        prepend-inner-icon="mdi-magnify"
        placeholder="Search by name, ID, village..."
        variant="solo-filled"
        flat
        density="compact"
        hide-details
        clearable
        rounded="pill"
        single-line
        class="flex-grow-1"
      />
      <v-btn
        icon="mdi-qrcode-scan"
        color="secondary"
        variant="flat"
        size="default"
        :title="'Scan Claim-169 to verify identity and jump to the record'"
        @click="onQuickScan"
      />
    </div>

    <EntityTypeFilter
      v-if="filterChips.length > 1"
      v-model="activeFilter"
      :chips="filterChips"
      class="mb-3"
    />

    <div class="text-caption text-medium-emphasis mb-2">
      {{ filteredEntries.length }} {{ filteredEntries.length === 1 ? 'entry' : 'entries' }}
      <template v-if="searchTerm || activeFilter !== 'all'"> matching filter</template>
    </div>

    <v-list
      v-if="filteredEntries.length"
      lines="two"
      rounded="lg"
      elevation="1"
      bg-color="surface"
    >
      <v-list-item
        v-for="entry in filteredEntries"
        :key="entry.record.guid"
        :style="{ '--i': filteredEntries.indexOf(entry) }"
        class="entity-row"
        @click="onOpenDetail(entry.record)"
      >
        <template #prepend>
          <v-icon
            :icon="statusConfig(entry.record.status).icon"
            :color="statusConfig(entry.record.status).color"
            class="mr-3"
          />
        </template>
        <v-list-item-title class="font-weight-bold">
          {{
            entry.record.modified.data._displayName ||
              entry.record.modified.data.name ||
              entry.record.modified.name ||
              'Untitled record'
          }}
        </v-list-item-title>
        <v-list-item-subtitle>
          <span class="entity-row__meta">
            <v-chip size="x-small" variant="tonal" color="primary" class="entity-row__chip">
              {{ entry.formTitle }}
            </v-chip>
            Updated {{ formatTimestamp(entry.record.modified.lastUpdated) }}
          </span>
        </v-list-item-subtitle>
        <template #append>
          <div class="d-flex align-center ga-2">
            <v-chip
              size="x-small"
              :color="statusConfig(entry.record.status).color"
              variant="tonal"
            >
              {{ statusConfig(entry.record.status).label }}
            </v-chip>
            <v-icon icon="mdi-chevron-right" size="small" color="medium-emphasis" />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-empty-state
      v-else
      icon="mdi-inbox-outline"
      title="No records yet"
      text="Tap + to start collecting."
    />

    <v-btn
      icon="mdi-plus"
      color="primary"
      class="app-view__fab"
      elevation="3"
      size="large"
      aria-label="New entry"
      @click="showNewSheet = true"
    />

    <NewEntitySheet
      v-model="showNewSheet"
      :forms="newFormOptions"
      @select="onPickNewForm"
    />
  </v-container>
</template>

<style scoped>
.app-view {
  position: relative;
  /* Bottom nav is 56 px tall + safe-area inset on devices with gesture bars.
     Pad enough so list rows don't hide behind nav OR the FAB sitting above it. */
  padding-bottom: calc(56px + 72px + env(safe-area-inset-bottom, 0px));
}

.app-view__fab {
  position: fixed;
  right: 20px;
  /* Sit above v-bottom-navigation (56 px) + safe-area gesture bar + 16 px gap. */
  bottom: calc(56px + 16px + env(safe-area-inset-bottom, 0px));
  /* Vuetify v-bottom-navigation uses z-index ~1004; FAB must clear that. */
  z-index: 1010;
}

.entity-row {
  animation: entity-row-fade 240ms ease both;
  animation-delay: calc(min(var(--i, 0), 12) * 50ms);
}

.entity-row__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.entity-row__chip {
  margin-right: 4px;
}

@keyframes entity-row-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .entity-row {
    animation: none;
  }
}
</style>
