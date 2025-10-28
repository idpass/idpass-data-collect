<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AxiosError } from 'axios'
import {
  deleteApp as deleteAppApi,
  externalSync as externalSyncApi,
  getApp,
  getAppConfigJsonUrl,
  getAppQrCodeUrl,
  getEntitiesCountByForm,
  getEntities,
} from '@/api'
import BasicAuthDialog from '@/components/BasicAuthDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useSnackBarStore } from '@/stores/snackBar'
import DataDiagnostics from '@/components/DataDiagnostics.vue'

interface EntityForm {
  name: string
  title: string
  dependsOn?: string
  formio?: Record<string, unknown>
  version?: string
}

interface EntityData {
  name: string
  data?: Array<Record<string, unknown>>
}

interface ExternalSyncConfig {
  type?: string
  url?: string
  auth?: string
  [key: string]: unknown
}

interface AuthConfig {
  type: string
  fields: Record<string, string>
}

interface AppConfig {
  id: string
  artifactId?: string
  name: string
  description?: string
  version?: string
  entityForms?: EntityForm[]
  entityData?: EntityData[]
  externalSync?: ExternalSyncConfig
  authConfigs?: AuthConfig[]
  createdAt?: string
  updatedAt?: string
}

interface FormOverviewItem {
  id: string
  title: string
  records: number
  dependsOn?: string
  fields: number
}

const authStore = useAuthStore()
const snackBarStore = useSnackBarStore()
const route = useRoute()
const router = useRouter()

const app = ref<AppConfig | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const activeTab = ref<'entities' | 'forms'>('entities')
const showQrDialog = ref(false)
const showAuthDialog = ref(false)
const isSyncing = ref(false)
const isDeleting = ref(false)
const entityRecords = ref<Record<string, unknown[]>>({})

const routeId = computed(() => route.params.id as string)

const hasExternalSync = computed(() => {
  const config = app.value?.externalSync
  return Boolean(config && Object.keys(config).length > 0)
})

const requiresCredentials = computed(() => app.value?.externalSync?.auth === 'basic')

const syncStatus = computed(() => {
  if (!hasExternalSync.value) {
    return {
      label: 'Local only',
      color: 'grey-darken-2',
      icon: 'mdi-lan-disconnect',
      description: 'Data remains on device until exported manually.',
    }
  }

  const requiresAuth = app.value?.externalSync?.auth === 'basic'

  return {
    label: requiresAuth ? 'Sync secured' : 'Sync enabled',
    color: requiresAuth ? 'warning' : 'success',
    icon: requiresAuth ? 'mdi-shield-key-outline' : 'mdi-sync',
    description: app.value?.description || '',
  }
})

const forms = computed(() => app.value?.entityForms ?? [])

const entityCounts = ref<Record<string, number>>({})

const entityDataMap = computed(() => {
  const map = new Map<string, number>()
  forms.value.forEach((form) => {
    if (!form || !form.name) return
    map.set(form.name, entityCounts.value[form.name] ?? 0)
  })
  return map
})

const totalEntities = computed(() => {
  let count = 0
  entityDataMap.value.forEach((value) => {
    count += value
  })
  return count
})

const countFormFields = (formio?: Record<string, unknown>): number => {
  const root = formio as { components?: unknown[] } | undefined
  if (!root?.components || !Array.isArray(root.components)) {
    return 0
  }

  const traverse = (components: unknown[]): number => {
    return components.reduce((sum: number, component) => {
      if (!component || typeof component !== 'object') {
        return sum
      }

      const typedComponent = component as {
        input?: boolean
        type?: string
        components?: unknown[]
        columns?: Array<{ components?: unknown[] }>
        rows?: Array<Array<{ components?: unknown[] }>>
      }

      let nested = 0
      if (Array.isArray(typedComponent.components)) {
        nested += traverse(typedComponent.components)
      }
      if (Array.isArray(typedComponent.columns)) {
        nested += typedComponent.columns.reduce((columnSum: number, column) => {
          if (!column?.components) return columnSum
          return columnSum + traverse(column.components)
        }, 0)
      }
      if (Array.isArray(typedComponent.rows)) {
        nested += typedComponent.rows.reduce((rowSum: number, row) => {
          if (!Array.isArray(row)) return rowSum
          return (
            rowSum +
            row.reduce((cellSum: number, cell) => {
              if (!cell?.components) return cellSum
              return cellSum + traverse(cell.components)
            }, 0)
          )
        }, 0)
      }

      const isField = Boolean(typedComponent.input) && typedComponent.type !== 'button'
      return sum + (isField ? 1 : 0) + nested
    }, 0)
  }

  return traverse(root.components)
}

const formOverview = computed<FormOverviewItem[]>(() => {
  return forms.value.map((form, index) => {
    const formId = form.name || `entity-${index}`
    return {
      id: formId,
      title: form.title || formId,
      dependsOn: form.dependsOn,
      fields: countFormFields(form.formio),
      records: entityDataMap.value.get(form.name) ?? 0,
    }
  })
})

const downloadUrl = computed(() => {
  const artifactId = app.value?.artifactId
  if (!artifactId) {
    return ''
  }
  try {
    return getAppConfigJsonUrl(artifactId)
  } catch (err) {
    console.error('Failed to resolve download URL', err)
    return ''
  }
})

const qrUrl = computed(() => {
  const artifactId = app.value?.artifactId
  if (!artifactId) {
    return ''
  }
  try {
    return getAppQrCodeUrl(artifactId)
  } catch (err) {
    console.error('Failed to resolve QR URL', err)
    return ''
  }
})

const lastUpdated = computed(() => app.value?.updatedAt || app.value?.createdAt || '')

const formattedLastUpdated = computed(() => {
  if (!lastUpdated.value) {
    return 'Not available'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(lastUpdated.value))
  } catch (err) {
    console.error('Failed to format date', err)
    return lastUpdated.value
  }
})

const overviewMetrics = computed(() => [
  {
    label: 'Forms',
    value: forms.value.length,
    icon: 'mdi-file-document-outline',
  },
  {
    label: 'Entities',
    value: totalEntities.value,
    icon: 'mdi-account-multiple-outline',
  },
])

const fetchApp = async () => {
  if (!routeId.value) {
    error.value = 'Missing collection program id.'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const data = await getApp(routeId.value)
    app.value = data
    
    // Fetch entity counts grouped by form
    const counts = await getEntitiesCountByForm(routeId.value)
    entityCounts.value = counts
    
    // Fetch entity records
    const records = await getEntities(routeId.value)
    // Group records by entityName for easier display
    const grouped: Record<string, unknown[]> = {}
    records.forEach((record) => {
      const key = record.entityName || 'Unknown'
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(record)
    })
    entityRecords.value = grouped
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 401) {
      authStore.logout()
      return
    }
    console.error('Failed to load collection program', err)
    error.value = err instanceof Error ? err.message : 'Failed to load collection program.'
  } finally {
    isLoading.value = false
  }
}

const handleSync = async () => {
  if (!app.value || !hasExternalSync.value) {
    snackBarStore.showSnackbar('No external sync configured for this collection program', 'warning')
    return
  }

  if (requiresCredentials.value) {
    showAuthDialog.value = true
    return
  }

  await triggerSync()
}

const triggerSync = async (credentials?: { username: string; password: string }) => {
  if (!app.value) {
    return
  }

  try {
    isSyncing.value = true
    await externalSyncApi(app.value.id, credentials)
    snackBarStore.showSnackbar('External sync triggered', 'success')
  } catch (err) {
    console.error('Failed to sync collection program', err)
    snackBarStore.showSnackbar('Failed to trigger external sync', 'red')
  } finally {
    isSyncing.value = false
  }
}

const onCredentialsSubmit = async (credentials: { username: string; password: string }) => {
  showAuthDialog.value = false
  await triggerSync(credentials)
}

const openEditor = () => {
  if (!routeId.value) return
  router.push({ name: 'edit', params: { id: routeId.value } })
}

const duplicateConfig = () => {
  if (!routeId.value) return
  router.push({ name: 'copy', params: { id: routeId.value } })
}

const handleDelete = async () => {
  if (!app.value) {
    return
  }

  const confirmed = window.confirm(
    'Are you sure you want to delete this collection program? This action cannot be undone.',
  )
  if (!confirmed) {
    return
  }

  try {
    isDeleting.value = true
    await deleteAppApi(app.value.id)
    snackBarStore.showSnackbar('Collection program deleted', 'success')
    router.push({ name: 'home' })
  } catch (err) {
    console.error('Failed to delete collection program', err)
    snackBarStore.showSnackbar('Failed to delete collection program', 'red')
  } finally {
    isDeleting.value = false
  }
}

const goBack = () => {
  router.push({ name: 'home' })
}

const navigateToEntityDetail = (record: unknown) => {
  const typedRecord = record as Record<string, unknown>
  const guid = typedRecord.guid as string
  if (guid) {
    router.push({ name: 'entity-details', params: { id: routeId.value, guid } })
  }
}

onMounted(() => {
  fetchApp()
})

watch(
  () => route.params.id,
  () => {
    fetchApp()
  },
)
</script>

<template>
  <v-container class="app-details" fluid>
    <v-btn class="details-back" variant="text" prepend-icon="mdi-arrow-left" @click="goBack">
      Back to Collection Programs
    </v-btn>

    <v-skeleton-loader v-if="isLoading" class="mt-6" type="card, list-item-two-line" />

    <v-alert v-else-if="error" class="mt-6" type="error" border="start" variant="tonal">
      {{ error }}
    </v-alert>

    <template v-else-if="app">
      <div class="details-header">
        <div class="details-header__text">
          <div class="details-header__meta">
            <v-chip :color="syncStatus.color" size="small" variant="tonal" density="comfortable">
              <v-icon :icon="syncStatus.icon" size="16" start />
              {{ syncStatus.label }}
            </v-chip>
            <span class="details-header__version">Version {{ app.version || 'N/A' }}</span>
          </div>
          <h1 class="details-header__title">{{ app.name }}</h1>
          <p class="details-header__subtitle">
            {{ app.description }}
          </p>
        </div>
        <div class="details-header__actions">
          <v-btn
            class="details-header__action"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-qrcode"
            :disabled="!qrUrl"
            @click="showQrDialog = true"
          >
            Show QR
          </v-btn>
          <v-btn
            class="details-header__action"
            color="primary"
            prepend-icon="mdi-pencil"
            @click="openEditor"
          >
            Open in Editor
          </v-btn>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                class="details-header__action"
                icon="mdi-dots-vertical"
                variant="text"
                color="primary"
                v-bind="props"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-sync"
                title="Trigger sync"
                :disabled="isSyncing || !hasExternalSync"
                @click="handleSync"
              />
              <v-list-item
                prepend-icon="mdi-content-copy"
                title="Duplicate"
                @click="duplicateConfig"
              />
              <v-list-item
                v-if="downloadUrl"
                :href="downloadUrl"
                prepend-icon="mdi-download"
                title="Download JSON"
                target="_blank"
              />
              <v-divider class="my-1" />
              <v-list-item
                prepend-icon="mdi-delete"
                title="Delete"
                color="error"
                :disabled="isDeleting"
                @click="handleDelete"
              />
            </v-list>
          </v-menu>
        </div>
      </div>

      <v-row class="mt-6" dense>
        <v-col cols="12" lg="8">
          <v-card class="details-content" border="md" elevation="0">
            <v-tabs v-model="activeTab" class="details-tabs" color="primary" slider-color="primary">
              <v-tab value="entities">Entities</v-tab>
              <v-tab value="forms">Forms</v-tab>
            </v-tabs>

            <v-window v-model="activeTab" class="details-window">
              <v-window-item value="entities">
                <div class="entities-panel">
                  <p class="entities-panel__subtitle">
                    View the latest captured entity records across each form.
                  </p>

                  <div v-if="Object.keys(entityRecords).length === 0" class="entities-table__empty mt-6">
                    No entities have been captured for this collection program yet.
                  </div>

                  <div v-else class="entities-list">
                    <div
                      v-for="(records, formName) in entityRecords"
                      :key="formName"
                      class="entity-form-group"
                    >
                      <h3 class="entity-form-group__title">
                        {{ formName }}
                        <v-chip
                          class="ml-2"
                          size="small"
                          variant="tonal"
                          color="primary"
                        >
                          {{ records.length }} records
                        </v-chip>
                      </h3>

                      <v-table density="comfortable" class="entity-records-table">
                        <thead>
                          <tr>
                            <th>GUID</th>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(record, idx) in records" :key="`${formName}-${idx}`" @click="navigateToEntityDetail(record)">
                            <td>
                              <span class="entity-guid" :title="String((record as any).guid)">
                                {{ String((record as any).guid).substring(0, 8) }}...
                              </span>
                            </td>
                            <td>{{ (record as any).name || '—' }}</td>
                            <td>
                              <v-chip size="small" variant="outlined">
                                {{ (record as any).type }}
                              </v-chip>
                            </td>
                            <td class="text-medium-emphasis">
                              {{
                                new Intl.DateTimeFormat(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }).format(new Date(String((record as any).lastUpdated)))
                              }}
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </div>
                  </div>
                </div>
              </v-window-item>

              <v-window-item value="forms">
                <div class="forms-panel">
                  <p class="forms-panel__subtitle">
                    Review each form schema, track field coverage, and understand entity dependencies.
                  </p>

                  <v-row class="mt-2" dense>
                    <v-col
                      v-for="item in formOverview"
                      :key="item.id"
                      cols="12"
                      md="6"
                    >
                      <v-card class="form-card" border="md" elevation="0">
                        <v-card-text>
                          <div class="form-card__header">
                            <div>
                              <h3 class="form-card__title">{{ item.title }}</h3>
                              <p class="form-card__id">Entity ID • {{ item.id }}</p>
                            </div>
                            <v-chip color="primary" size="small" variant="tonal">
                              {{ item.records }} records
                            </v-chip>
                          </div>
                          <p class="form-card__summary">
                            This form currently has {{ item.fields }} configured field{{ item.fields === 1 ? '' : 's' }}
                            and {{ item.records }} captured record{{ item.records === 1 ? '' : 's' }}.
                          </p>
                          <div class="form-card__meta">
                            <div class="form-card__meta-item">
                              <span class="form-card__meta-label">Fields</span>
                              <span class="form-card__meta-value">{{ item.fields }}</span>
                            </div>
                            <div class="form-card__meta-item">
                              <span class="form-card__meta-label">Dependency</span>
                              <span class="form-card__meta-value">
                                {{ item.dependsOn ? `Depends on ${item.dependsOn}` : 'Standalone' }}
                              </span>
                            </div>
                          </div>
                        </v-card-text>
                      </v-card>
                    </v-col>
                    <v-col v-if="!formOverview.length" cols="12">
                      <v-alert border="start" variant="tonal" type="info">
                        No forms have been configured for this collection program yet.
                      </v-alert>
                    </v-col>
                  </v-row>
                </div>
              </v-window-item>
            </v-window>
          </v-card>
        </v-col>

        <v-col cols="12" lg="4">
          <v-card class="overview-card" border="md" elevation="0">
            <v-card-text>
              <div class="overview-card__header">
                <h2 class="overview-card__title">Overview</h2>
                <v-chip :color="syncStatus.color" variant="tonal" size="small" density="comfortable">
                  {{ syncStatus.label }}
                </v-chip>
              </div>
              <div class="overview-card__stats">
                <div v-for="metric in overviewMetrics" :key="metric.label" class="overview-card__stat">
                  <div class="overview-card__stat-icon">
                    <v-icon :icon="metric.icon" size="24" />
                  </div>
                  <div>
                    <p class="overview-card__stat-label">{{ metric.label }}</p>
                    <p class="overview-card__stat-value">{{ metric.value }}</p>
                  </div>
                </div>
              </div>
              <v-divider class="my-4" />
              <div class="overview-card__details">
                <div class="overview-card__row">
                  <span class="overview-card__row-label">Config ID</span>
                  <span class="overview-card__row-value">{{ app.id }}</span>
                </div>
                <div class="overview-card__row" v-if="app.artifactId">
                  <span class="overview-card__row-label">Artifact ID</span>
                  <span class="overview-card__row-value">{{ app.artifactId }}</span>
                </div>
                <div class="overview-card__row">
                  <span class="overview-card__row-label">Version</span>
                  <span class="overview-card__row-value">{{ app.version || 'N/A' }}</span>
                </div>
                <div class="overview-card__row">
                  <span class="overview-card__row-label">Last updated</span>
                  <span class="overview-card__row-value">{{ formattedLastUpdated }}</span>
                </div>
                <div class="overview-card__row">
                  <span class="overview-card__row-label">External sync</span>
                  <span class="overview-card__row-value">{{ syncStatus.description }}</span>
                </div>
                <div class="overview-card__row">
                  <span class="overview-card__row-label">Deployment URL</span>
                  <a
                    v-if="downloadUrl"
                    :href="downloadUrl"
                    target="_blank"
                    rel="noopener"
                    class="overview-card__link"
                  >
                    {{ downloadUrl }}
                  </a>
                  <span v-else class="overview-card__row-value overview-card__row-value--muted">
                    Not generated yet
                  </span>
                </div>
              </div>
            </v-card-text>
            <v-divider />
            <v-card-actions class="overview-card__actions">
              <v-btn
                variant="tonal"
                color="primary"
                prepend-icon="mdi-sync"
                :loading="isSyncing"
                :disabled="isSyncing || !hasExternalSync"
                @click="handleSync"
              >
                Trigger Sync
              </v-btn>
              <v-btn
                variant="text"
                color="primary"
                prepend-icon="mdi-download"
                :href="downloadUrl || undefined"
                :disabled="!downloadUrl"
                target="_blank"
              >
                Download JSON
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>

  <div v-if="app" class="diagnostic-container">
    <DataDiagnostics :config-id="routeId" />
  </div>

  <v-dialog v-model="showQrDialog" max-width="360">
    <v-card>
      <v-card-title class="text-h6">Scan to deploy</v-card-title>
      <v-card-text class="text-center">
        <v-img :src="qrUrl" alt="QR Code" max-width="220" class="mx-auto my-4" />
        <p class="text-body-2 text-medium-emphasis">
          Share this code with field teams to load the configuration instantly on their devices.
        </p>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" color="primary" @click="showQrDialog = false">Close</v-btn>
        <v-btn
          v-if="downloadUrl"
          variant="flat"
          color="primary"
          :href="downloadUrl"
          target="_blank"
          prepend-icon="mdi-download"
        >
          Download JSON
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <BasicAuthDialog
    v-model="showAuthDialog"
    title="Sync collection program"
    description="Enter your credentials to start the external sync."
    @submit="onCredentialsSubmit"
  />
</template>

<style scoped>
.app-details {
  padding-bottom: 64px;
}

.details-back {
  margin-top: 8px;
  padding-left: 0;
}

.details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.details-header__text {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.details-header__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.details-header__version {
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.6);
}

.details-header__title {
  font-size: clamp(1.75rem, 1.6rem + 0.5vw, 2.4rem);
  font-weight: 600;
  margin: 0;
}

.details-header__subtitle {
  margin: 0;
  font-size: 1rem;
  color: rgba(0, 0, 0, 0.6);
}

.details-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.details-header__action {
  min-width: 0;
}

.details-content {
  border-radius: 20px;
  overflow: hidden;
}

.details-tabs {
  padding: 0 24px;
}

.details-window {
  padding: 24px;
}

.entities-panel__subtitle,
.forms-panel__subtitle {
  margin: 0 0 16px;
  color: rgba(0, 0, 0, 0.6);
}

.entities-table {
  border-radius: 16px;
  overflow: hidden;
}

.entities-table thead th {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.5);
  padding-top: 12px;
  padding-bottom: 12px;
}

.entities-table tbody td {
  padding-top: 16px;
  padding-bottom: 16px;
  vertical-align: middle;
}

.entities-table__id {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
}

.entities-table__title {
  font-weight: 500;
}

.entities-table__records {
  font-weight: 600;
}

.entities-table__empty {
  text-align: center;
  padding: 32px 16px;
  color: rgba(0, 0, 0, 0.6);
}

.entities-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.entity-form-group {
  padding: 16px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.entity-form-group__title {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.entity-records-table {
  border-radius: 12px;
  overflow: hidden;
}

.entity-records-table thead th {
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.5);
  padding-top: 12px;
  padding-bottom: 12px;
}

.entity-records-table tbody td {
  padding-top: 12px;
  padding-bottom: 12px;
  vertical-align: middle;
}

.entity-records-table tbody tr {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.entity-records-table tbody tr:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.entity-guid {
  font-family: monospace;
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.7);
}

.forms-panel {
  display: flex;
  flex-direction: column;
}

.form-card {
  border-radius: 18px;
  height: 100%;
}

.form-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.form-card__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.form-card__id {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.55);
}

.form-card__summary {
  margin: 16px 0;
  font-size: 0.95rem;
  color: rgba(0, 0, 0, 0.6);
}

.form-card__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
}

.form-card__meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-card__meta-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
}

.form-card__meta-value {
  font-weight: 600;
}

.overview-card {
  border-radius: 20px;
}

.overview-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overview-card__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.overview-card__stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.overview-card__stat {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview-card__stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.overview-card__stat-label {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.55);
}

.overview-card__stat-value {
  margin: 4px 0 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.overview-card__details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overview-card__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-card__row-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
}

.overview-card__row-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.78);
  word-break: break-word;
}

.overview-card__row-value--muted {
  color: rgba(0, 0, 0, 0.45);
}

.overview-card__link {
  font-size: 0.95rem;
  word-break: break-all;
  color: rgb(25, 118, 210);
  text-decoration: none;
}

.overview-card__link:hover {
  text-decoration: underline;
}

.overview-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
}

@media (max-width: 1280px) {
  .overview-card__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 960px) {
  .details-header {
    align-items: flex-start;
  }
  .details-header__actions {
    justify-content: flex-start;
  }
  .details-back {
    padding-left: 12px;
  }
}

.diagnostic-container {
  margin-top: 24px;
  padding: 24px;
  background-color: #f5f5f5;
  border-radius: 16px;
  border: 1px solid #e0e0e0;
}
</style>
