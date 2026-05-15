<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AxiosError } from 'axios'
import {
  archiveApp as archiveAppApi,
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
import SyncStatusPanel from '@/components/SyncStatusPanel.vue'
import SyncScopeCard from '@/components/SyncScopeCard.vue'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import type { SyncScopePolicy } from '@idpass/data-collect-core'

interface EntityForm {
  name: string
  title: string
  dependsOn?: string
  entityType?: 'group' | 'individual' | 'record'
  formio?: Record<string, unknown>
  version?: string
}

interface EntityData {
  name: string
  data?: Array<Record<string, unknown>>
}

interface FieldMapping {
  formField: string
  opensppField: string
  transformer: { type: string; options?: Record<string, unknown> }
}

interface ExternalSyncConfig {
  type?: string
  url?: string
  auth?: string
  adapterConfig?: Record<string, string | number | boolean>
  fieldMappings?: FieldMapping[]
  [key: string]: unknown
}

interface SelfServiceConfig {
  enabled: boolean
  authMethods: string[]
  allowedForms: string[]
  requireReview: boolean
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
  selfService?: SelfServiceConfig
  syncScope?: SyncScopePolicy | null
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
const activeTab = ref<'entities' | 'forms' | 'integration' | 'mapping' | 'auth'>('entities')
// Demo-mode: donor audience never touches the config-time tabs.
// Toggle to false post-demo to restore Mapping + Auth tabs.
const demoMode = ref(true)
const showQrDialog = ref(false)
const showAuthDialog = ref(false)
const isDeleting = ref(false)
const qrError = ref(false)
const entityRecords = ref<Record<string, unknown[]>>({})
const syncPanelRef = ref<InstanceType<typeof SyncStatusPanel> | null>(null)
const scopedSyncEnabled = useFeatureFlag('scopedSync')

function onSyncScopeUpdated(policy: SyncScopePolicy | null) {
  if (!app.value) return
  app.value = { ...app.value, syncScope: policy }
}

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
    }
  }

  if (syncPanelRef.value?.isSyncing) {
    return {
      label: 'Syncing...',
      color: 'info',
      icon: 'mdi-sync',
    }
  }

  const last = syncPanelRef.value?.lastEvent
  if (!last) {
    return {
      label: 'Ready',
      color: 'blue-grey',
      icon: 'mdi-sync',
    }
  }

  const map: Record<string, { label: string; color: string; icon: string }> = {
    success: { label: 'Last sync OK', color: 'success', icon: 'mdi-check-circle-outline' },
    partial: { label: 'Sync warnings', color: 'warning', icon: 'mdi-alert-outline' },
    failed: { label: 'Sync failed', color: 'error', icon: 'mdi-alert-circle-outline' },
  }

  return map[last.status] || { label: 'Ready', color: 'blue-grey', icon: 'mdi-sync' }
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
  // Sum all entity counts, including "Unknown" and any other entityNames
  // This ensures consistency with backend /count endpoint which counts all entities
  let count = 0
  Object.values(entityCounts.value).forEach((value) => {
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

const handleQrError = () => {
  qrError.value = true
}

watch(showQrDialog, (isOpen) => {
  if (isOpen) {
    // Reset error when dialog opens
    qrError.value = false
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

const syncTypeLabel = computed(() => {
  const typeMap: Record<string, string> = {
    'mock': 'Mock Registry Server',
    'openspp-v1-adapter': 'OpenSPP V1',
    'openspp-v2-adapter': 'OpenSPP V2',
    'openfn-adapter': 'OpenFn',
  }
  return typeMap[app.value?.externalSync?.type || ''] || app.value?.externalSync?.type || 'Not configured'
})

const fieldMappings = computed(() => app.value?.externalSync?.fieldMappings ?? [])

const authConfigs = computed(() => app.value?.authConfigs ?? [])

const selfServiceConfig = computed(() => app.value?.selfService)

const authTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    auth0: 'Auth0',
    keycloak: 'Keycloak',
  }
  return typeMap[type] || type || 'Unknown'
}

const isLoadingEntities = ref(false)

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
    isLoadingEntities.value = true
    try {
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
    } finally {
      isLoadingEntities.value = false
    }
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

const onCredentialsSubmit = async (credentials: { username: string; password: string }) => {
  showAuthDialog.value = false
  syncPanelRef.value?.triggerWithCredentials(credentials)
}

const openEditor = (step: string = 'general') => {
  if (!routeId.value) return
  router.push({
    name: `wizard-${step}`,
    query: { mode: 'edit', id: routeId.value },
  })
}

const duplicateConfig = () => {
  if (!routeId.value) return
  router.push({ name: 'copy', params: { id: routeId.value } })
}

const showArchiveDialog = ref(false)

const handleArchive = async () => {
  if (!app.value) {
    return
  }

  showArchiveDialog.value = true
}

const confirmArchive = async () => {
  if (!app.value) {
    return
  }

  try {
    isDeleting.value = true
    await archiveAppApi(app.value.id)
    snackBarStore.showSnackbar('Collection program archived', 'success')
    router.push({ name: 'home' })
  } catch (err) {
    console.error('Failed to archive collection program', err)
    snackBarStore.showSnackbar('Failed to archive collection program', 'red')
  } finally {
    isDeleting.value = false
    showArchiveDialog.value = false
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
    <div class="subpage-nav">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
        Collection Programs
      </v-btn>
    </div>

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
            variant="tonal"
            color="primary"
            prepend-icon="mdi-pencil"
            @click="openEditor()"
          >
            Edit
          </v-btn>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn
                icon="mdi-dots-vertical"
                variant="text"
                color="primary"
                v-bind="props"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-qrcode"
                title="Deploy to Device"
                :disabled="!qrUrl"
                @click="showQrDialog = true"
              />
              <v-list-item
                prepend-icon="mdi-content-duplicate"
                title="Duplicates"
                @click="router.push({ name: 'duplicates', params: { id: routeId } })"
              />
              <v-list-item
                v-if="scopedSyncEnabled"
                data-testid="app-details-devices-link"
                prepend-icon="mdi-cellphone-link"
                title="View device sync activity"
                @click="router.push({ name: 'devices', params: { configId: app.id } })"
              />
              <v-list-item
                prepend-icon="mdi-merge"
                title="Conflicts"
                data-testid="app-details-conflicts-link"
                @click="router.push({ name: 'conflicts', params: { id: routeId } })"
              />
              <v-list-item
                prepend-icon="mdi-content-copy"
                title="Duplicate Config"
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
                prepend-icon="mdi-archive"
                title="Archive"
                color="warning"
                :disabled="isDeleting"
                @click="handleArchive"
              />
            </v-list>
          </v-menu>
        </div>
      </div>

      <SyncStatusPanel
        v-if="hasExternalSync"
        ref="syncPanelRef"
        :config-id="app.id"
        :has-external-sync="hasExternalSync"
        :requires-credentials="requiresCredentials"
        @sync-completed="fetchApp"
        @request-credentials="showAuthDialog = true"
      />

      <SyncScopeCard
        v-if="scopedSyncEnabled"
        :app-id="app.id"
        :policy="app.syncScope ?? null"
        @update:policy="onSyncScopeUpdated"
      />

      <div class="details-grid">
        <div>
          <v-card class="details-content" border="md" elevation="0">
            <v-tabs v-model="activeTab" class="details-tabs" color="primary" slider-color="primary" show-arrows>
              <v-tab value="entities">Entities</v-tab>
              <v-tab value="forms">Forms</v-tab>
              <v-tab value="integration">Integration</v-tab>
              <v-tab v-if="!demoMode" value="mapping">Field Mapping</v-tab>
              <v-tab v-if="!demoMode" value="auth">Authentication</v-tab>
            </v-tabs>

            <v-window v-model="activeTab" class="details-window">
              <v-window-item value="entities">
                <div class="entities-panel">
                  <p class="entities-panel__subtitle">
                    View the latest captured entity records across each form.
                  </p>

                  <v-progress-linear v-if="isLoadingEntities" class="mt-4" color="primary" indeterminate />

                  <div v-else-if="Object.keys(entityRecords).length === 0" class="entities-table__empty mt-6">
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
                                {{ (record as any).entityName || (record as any).type }}
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
                  <div class="section-panel__header">
                    <p class="forms-panel__subtitle">
                      Review each form schema, track field coverage, and understand entity dependencies.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      size="small"
                      prepend-icon="mdi-pencil"
                      @click="openEditor('forms')"
                    >
                      Edit Forms
                    </v-btn>
                  </div>

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

              <v-window-item value="integration">
                <div class="section-panel">
                  <div class="section-panel__header">
                    <p class="section-panel__subtitle">
                      External system integration configuration for data synchronization.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      size="small"
                      prepend-icon="mdi-pencil"
                      @click="openEditor('integration')"
                    >
                      Edit Integration
                    </v-btn>
                  </div>

                  <template v-if="hasExternalSync">
                    <div class="summary-fields">
                      <div class="summary-field">
                        <span class="summary-field__label">Integration Type</span>
                        <span class="summary-field__value">{{ syncTypeLabel }}</span>
                      </div>
                      <div class="summary-field">
                        <span class="summary-field__label">API URL</span>
                        <span class="summary-field__value">{{ app.externalSync?.url || '—' }}</span>
                      </div>
                      <div class="summary-field">
                        <span class="summary-field__label">Authentication</span>
                        <span class="summary-field__value">{{ app.externalSync?.auth || 'None' }}</span>
                      </div>
                    </div>
                  </template>

                  <div v-else class="section-panel__empty">
                    <v-icon icon="mdi-lan-disconnect" size="48" color="grey-lighten-1" />
                    <p class="section-panel__empty-text">No integration configured</p>
                    <p class="section-panel__empty-hint">
                      Connect to an external system to enable data synchronization.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      prepend-icon="mdi-plus"
                      @click="openEditor('integration')"
                    >
                      Configure Integration
                    </v-btn>
                  </div>
                </div>
              </v-window-item>

              <v-window-item v-if="!demoMode" value="mapping">
                <div class="section-panel">
                  <div class="section-panel__header">
                    <p class="section-panel__subtitle">
                      Map form fields to external system fields for data synchronization.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      size="small"
                      prepend-icon="mdi-pencil"
                      @click="openEditor('mapping')"
                    >
                      Edit Mapping
                    </v-btn>
                  </div>

                  <template v-if="fieldMappings.length > 0">
                    <p class="section-panel__count">
                      {{ fieldMappings.length }} mapping{{ fieldMappings.length === 1 ? '' : 's' }} configured
                    </p>
                    <v-table density="comfortable" class="mapping-table">
                      <thead>
                        <tr>
                          <th>Form Field</th>
                          <th>External Field</th>
                          <th>Transformer</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(mapping, index) in fieldMappings.slice(0, 5)" :key="index">
                          <td>{{ mapping.formField }}</td>
                          <td>{{ mapping.opensppField }}</td>
                          <td>
                            <v-chip size="x-small" variant="outlined">
                              {{ mapping.transformer.type }}
                            </v-chip>
                          </td>
                        </tr>
                      </tbody>
                    </v-table>
                    <p v-if="fieldMappings.length > 5" class="section-panel__more">
                      … and {{ fieldMappings.length - 5 }} more
                    </p>
                  </template>

                  <div v-else class="section-panel__empty">
                    <v-icon icon="mdi-swap-horizontal" size="48" color="grey-lighten-1" />
                    <p class="section-panel__empty-text">No field mappings configured</p>
                    <p class="section-panel__empty-hint">
                      Field mappings are optional and define how form data maps to external system fields.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      prepend-icon="mdi-plus"
                      @click="openEditor('mapping')"
                    >
                      Configure Mapping
                    </v-btn>
                  </div>
                </div>
              </v-window-item>

              <v-window-item v-if="!demoMode" value="auth">
                <div class="section-panel">
                  <div class="section-panel__header">
                    <p class="section-panel__subtitle">
                      Identity provider and self-service authentication settings.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      size="small"
                      prepend-icon="mdi-pencil"
                      @click="openEditor('auth')"
                    >
                      Edit Authentication
                    </v-btn>
                  </div>

                  <template v-if="authConfigs.length > 0 || selfServiceConfig?.enabled">
                    <div v-if="authConfigs.length > 0" class="auth-providers">
                      <h4 class="auth-providers__title">Identity Providers</h4>
                      <div
                        v-for="(auth, index) in authConfigs"
                        :key="index"
                        class="auth-provider-item"
                      >
                        <v-icon icon="mdi-shield-key" size="small" color="primary" />
                        <span class="auth-provider-item__type">{{ authTypeLabel(auth.type) }}</span>
                        <v-chip size="x-small" variant="tonal">
                          {{ Object.keys(auth.fields).length }} fields
                        </v-chip>
                      </div>
                    </div>

                    <div v-if="selfServiceConfig?.enabled" class="self-service-status">
                      <h4 class="self-service-status__title">Self-service</h4>
                      <div class="summary-fields">
                        <div class="summary-field">
                          <span class="summary-field__label">Status</span>
                          <v-chip size="small" color="success" variant="tonal">Enabled</v-chip>
                        </div>
                        <div v-if="selfServiceConfig.allowedForms.length" class="summary-field">
                          <span class="summary-field__label">Allowed Forms</span>
                          <span class="summary-field__value">{{ selfServiceConfig.allowedForms.join(', ') }}</span>
                        </div>
                      </div>
                    </div>
                  </template>

                  <div v-else class="section-panel__empty">
                    <v-icon icon="mdi-shield-off-outline" size="48" color="grey-lighten-1" />
                    <p class="section-panel__empty-text">No authentication configured</p>
                    <p class="section-panel__empty-hint">
                      Authentication is optional. Configure identity providers to enable user verification.
                    </p>
                    <v-btn
                      variant="tonal"
                      color="primary"
                      prepend-icon="mdi-plus"
                      @click="openEditor('auth')"
                    >
                      Configure Authentication
                    </v-btn>
                  </div>
                </div>
              </v-window-item>
            </v-window>
          </v-card>
        </div>

        <aside>
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
                  <span class="overview-card__row-value overview-card__row-value--mono">{{ app.id }}</span>
                </div>
                <div class="overview-card__row" v-if="app.artifactId">
                  <span class="overview-card__row-label">Artifact ID</span>
                  <span class="overview-card__row-value overview-card__row-value--mono">{{ app.artifactId }}</span>
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
                  <span class="overview-card__row-value">
                    {{ syncPanelRef?.lastSyncRelativeTime || syncStatus.label }}
                  </span>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </aside>
      </div>
      <div v-if="app" class="diagnostic-container">
        <DataDiagnostics :config-id="routeId" />
      </div>
    </template>
  </v-container>

  <v-dialog v-model="showQrDialog" :max-width="400">
    <v-card>
      <v-card-title class="text-h6">Deploy to Device</v-card-title>
      <v-card-text class="text-center">
        <v-img
          :src="qrUrl"
          alt="Deployment QR code"
          max-width="220"
          class="mx-auto my-4"
          @error="handleQrError"
        >
          <template v-if="qrError" #placeholder>
            <div class="text-center pa-4">
              <v-icon icon="mdi-alert-circle" size="48" color="error" class="mb-2" />
              <p class="text-body-2 text-error">Could not load deployment code</p>
              <p class="text-caption text-medium-emphasis mt-2">
                Please ensure the backend is accessible and the artifact ID is valid.
              </p>
            </div>
          </template>
        </v-img>
        <p v-if="!qrError" class="text-body-2 text-medium-emphasis">
          Scan from the mobile app to load this program configuration onto a device.
        </p>
        <v-alert v-if="qrError" type="warning" variant="tonal" density="compact" class="mt-2">
          Ensure the URL in the code is accessible from your network.
          If using localhost, configure PUBLIC_BASE_URL in your backend environment.
        </v-alert>
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
          Download Config
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

  <v-dialog v-model="showArchiveDialog" :max-width="540">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-archive" start />
        Archive Collection Program
      </v-card-title>
      <v-card-text>
        <p>Are you sure you want to archive <strong>{{ app?.name }}</strong>?</p>
        <p class="mt-2 text-medium-emphasis">
          The program configuration will be removed. Collected entity data will not be affected.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showArchiveDialog = false">Cancel</v-btn>
        <v-btn color="warning" variant="tonal" :loading="isDeleting" @click="confirmArchive">
          Archive
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.app-details {
  padding-bottom: var(--spacing-2xl);
}

.details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
}

.details-header__text {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.details-header__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.details-header__version {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.details-header__title {
  font-family: var(--font-family-display);
  font-size: clamp(1.75rem, 1.6rem + 0.5vw, 2.4rem);
  font-weight: 600;
  letter-spacing: -0.015em;
  margin: 0;
  color: var(--text-main);
}

.details-header__subtitle {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--text-muted);
}

.details-header__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.details-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: var(--spacing-xl);
  align-items: start;
  margin-top: var(--spacing-lg);
}

.details-content {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.details-tabs {
  padding: 0 var(--spacing-lg);
}

.details-window {
  padding: var(--spacing-lg);
}

.entities-panel__subtitle,
.forms-panel__subtitle {
  margin: 0 0 var(--spacing-md);
  color: var(--text-muted);
}

.entities-table {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.entities-table thead th {
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
}

.entities-table tbody td {
  padding-top: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  vertical-align: middle;
}

.entities-table__id {
  font-weight: 600;
  color: var(--text-main);
}

.entities-table__title {
  font-weight: 500;
}

.entities-table__records {
  font-weight: 600;
}

.entities-table__empty {
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
  color: var(--text-muted);
}

.entities-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.entity-form-group {
  padding: var(--spacing-md);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.entity-form-group__title {
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-base);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--text-main);
}

.entity-records-table {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.entity-records-table thead th {
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
}

.entity-records-table tbody td {
  padding-top: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  vertical-align: middle;
}

.entity-records-table tbody tr {
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.entity-records-table tbody tr:hover {
  background-color: var(--neutral-50);
}

.entity-guid {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  color: var(--text-main);
}

.section-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.section-panel__subtitle {
  margin: 0;
  color: var(--text-muted);
  flex: 1;
}

.section-panel__count {
  margin: 0 0 var(--spacing-md);
  font-weight: 600;
  color: var(--text-main);
}

.section-panel__more {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-style: italic;
}

.section-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
}

.section-panel__empty-text {
  margin: 0;
  font-weight: 600;
  color: var(--text-main);
}

.section-panel__empty-hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  max-width: 360px;
}

.summary-fields {
  display: flex;
  flex-direction: column;
}

.summary-field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);
}

.summary-field:last-child {
  border-bottom: none;
}

.summary-field__label {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.summary-field__value {
  font-size: var(--font-size-sm);
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  word-break: break-word;
  color: var(--text-main);
}

.mapping-table {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.mapping-table thead th {
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding-top: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
}

.mapping-table tbody td {
  padding-top: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  vertical-align: middle;
}

.auth-providers {
  margin-bottom: var(--spacing-lg);
}

.auth-providers__title,
.self-service-status__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.auth-provider-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
}

.auth-provider-item__type {
  font-weight: 500;
  color: var(--text-main);
  flex: 1;
}

.self-service-status {
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}

.forms-panel {
  display: flex;
  flex-direction: column;
}

.form-card {
  border-radius: var(--radius-xl);
  height: 100%;
}

.form-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.form-card__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-main);
}

.form-card__id {
  margin: var(--spacing-xs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.form-card__summary {
  margin: var(--spacing-md) 0;
  font-size: var(--font-size-base);
  color: var(--text-muted);
}

.form-card__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--spacing-md);
}

.form-card__meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-card__meta-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.form-card__meta-value {
  font-weight: 600;
  color: var(--text-main);
}

.overview-card {
  border-radius: var(--radius-xl);
}

.overview-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.overview-card__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-main);
}

.overview-card__stats {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.overview-card__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.overview-card__stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: var(--neutral-50);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.overview-card__stat-label {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.overview-card__stat-value {
  margin: var(--spacing-xs) 0 0;
  font-size: var(--font-size-2xl);
  font-weight: 600;
  color: var(--text-main);
}

.overview-card__details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.overview-card__row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.overview-card__row-label {
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-card__row-value {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--text-main);
  word-break: break-word;
}

.overview-card__row-value--muted {
  color: var(--text-muted);
}

.overview-card__row-value--mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  font-weight: 400;
  letter-spacing: 0.01em;
}

.overview-card__link {
  font-size: var(--font-size-base);
  word-break: break-all;
  color: var(--primary);
  text-decoration: none;
}

.overview-card__link:hover {
  text-decoration: underline;
  color: var(--brand);
}

@media (max-width: 1280px) {
  .details-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .details-header {
    align-items: flex-start;
  }
  .details-header__actions {
    justify-content: flex-start;
  }
}

.diagnostic-container {
  margin-top: var(--spacing-xl);
  padding: var(--spacing-lg);
  background-color: var(--neutral-50);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
}
</style>
