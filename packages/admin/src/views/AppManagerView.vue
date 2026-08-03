<!--
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
-->

<script setup lang="ts">
import {
  createApp as createAppApi,
  getApps as getAppsApi,
  type AppListItem,
  type AppListMeta,
  type AppListParams,
} from '@/api'
import AppCard from '@/components/AppCard.vue'
import OverviewPanel from '@/components/OverviewPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useSnackBarStore } from '@/stores/snackBar'
import { AxiosError } from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const snackBarStore = useSnackBarStore()
const router = useRouter()

const apps = ref<AppListItem[]>([])
const meta = ref<AppListMeta>({
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 0,
  sortBy: 'name',
  sortOrder: 'asc',
  search: '',
})

const page = ref(1)
const pageSize = ref(12)
const sortBy = ref<AppListParams['sortBy']>('name')
const sortOrder = ref<AppListParams['sortOrder']>('asc')
const searchTerm = ref('')
const showArchived = ref(false)
const isLoading = ref(false)
const isRefreshing = ref(false)

const sortByOptions = [
  { title: 'Name', value: 'name' },
  { title: 'ID', value: 'id' },
  { title: 'Entities Count', value: 'entitiesCount' },
]

const sortOrderOptions = [
  { title: 'Ascending', value: 'asc' },
  { title: 'Descending', value: 'desc' },
]

const hasNoResults = computed(() => !isLoading.value && apps.value.length === 0)
const totalApps = computed(() => meta.value.total)
const syncEnabledCount = computed(
  () => apps.value.filter((app) => Object.keys(app.externalSync || {}).length > 0).length,
)
const totalEntities = computed(() =>
  apps.value.reduce((sum, app) => sum + (app.entitiesCount || 0), 0),
)
const localOnlyCount = computed(() => Math.max(totalApps.value - syncEnabledCount.value, 0))

let searchDebounce: ReturnType<typeof setTimeout> | undefined

const fetchApps = async (isRefresh = false) => {
  if (isRefresh) {
    isRefreshing.value = true
  } else {
    isLoading.value = true
  }
  try {
    const response = await getAppsApi({
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      search: searchTerm.value.trim() || undefined,
      includeArchived: showArchived.value || undefined,
    })
    apps.value = response.data
    meta.value = response.meta
    if (page.value !== response.meta.page) {
      page.value = response.meta.page
    }
    if (pageSize.value !== response.meta.pageSize) {
      pageSize.value = response.meta.pageSize
    }
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 401) {
      authStore.logout()
      return
    }
    console.error('Error fetching apps:', error)
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

watch(page, () => {
  fetchApps()
})

watch(pageSize, () => {
  page.value = 1
  fetchApps()
})

watch(sortBy, () => {
  page.value = 1
  fetchApps()
})

watch(sortOrder, () => {
  page.value = 1
  fetchApps()
})

watch(showArchived, () => {
  page.value = 1
  fetchApps()
})

watch(searchTerm, (newVal) => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }
  if (newVal === null) {
    searchTerm.value = ''
    page.value = 1
    fetchApps()
    return
  }
  searchDebounce = setTimeout(() => {
    page.value = 1
    fetchApps()
  }, 300)
})

const goToCreate = () => {
  router.push({ name: 'create' })
}

// JSON Config Import
const showImportDialog = ref(false)
const jsonFile = ref<File | null>(null)
const jsonFileError = ref<string | null>(null)
const isUploadingJson = ref(false)
const showDuplicateConfirm = ref(false)
const pendingImportJson = ref<Record<string, unknown> | null>(null)
const pendingDuplicateId = ref('')

const uploadJsonConfig = async (force = false) => {
  if (!jsonFile.value) return

  isUploadingJson.value = true
  jsonFileError.value = null

  try {
    let json: Record<string, unknown>
    if (force && pendingImportJson.value) {
      json = pendingImportJson.value
    } else {
      const text = await jsonFile.value.text()
      json = JSON.parse(text)

      if (!json || typeof json !== 'object') {
        throw new Error('Invalid configuration format')
      }
    }

    if (!force && json.id) {
      const existingApps = await getAppsApi({ search: json.id as string, pageSize: 1 })
      if (existingApps.data.some((app) => app.id === json.id)) {
        pendingImportJson.value = json
        pendingDuplicateId.value = json.id as string
        isUploadingJson.value = false
        showDuplicateConfirm.value = true
        return
      }
    }

    const formData = new FormData()
    formData.append(
      'config',
      new Blob([JSON.stringify(json)], { type: 'application/json' }),
      'config.json',
    )

    await createAppApi(formData)
    showImportDialog.value = false
    showDuplicateConfirm.value = false
    jsonFile.value = null
    jsonFileError.value = null
    pendingImportJson.value = null
    snackBarStore.showSnackbar('Collection program imported successfully', 'success')
    fetchApps()
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 401) {
      authStore.logout()
      return
    }
    if (error instanceof AxiosError && error.response?.status === 409) {
      jsonFileError.value = 'A collection program with this ID already exists.'
    } else {
      jsonFileError.value =
        error instanceof Error ? error.message : 'Error uploading configuration'
    }
  } finally {
    isUploadingJson.value = false
  }
}

const confirmImportOverwrite = () => {
  showDuplicateConfirm.value = false
  uploadJsonConfig(true)
}

const cancelDuplicateConfirm = () => {
  showDuplicateConfirm.value = false
  pendingImportJson.value = null
}

onMounted(() => {
  fetchApps()
})

onBeforeUnmount(() => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }
})
</script>

<template>
  <v-container class="app-dashboard" fluid>
    <div class="dashboard-grid">
      <!-- Main Content -->
      <div class="dashboard-main">
        <!-- Header with title and icon buttons -->
        <div class="page-header">
          <div class="page-header__text">
            <h1 class="page-header__title">Collection Programs</h1>
            <p class="page-header__subtitle">Manage and monitor your form applications</p>
          </div>
          <div class="page-header__actions">
            <v-tooltip text="Refresh" location="bottom">
              <template v-slot:activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon
                  variant="tonal"
                  color="primary"
                  :loading="isRefreshing"
                  :disabled="isRefreshing"
                  @click="fetchApps(true)"
                >
                  <v-icon icon="mdi-refresh" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip text="Import JSON Configuration" location="bottom">
              <template v-slot:activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon
                  variant="tonal"
                  color="primary"
                  @click="showImportDialog = true"
                >
                  <v-icon icon="mdi-upload" />
                </v-btn>
              </template>
            </v-tooltip>
            <v-tooltip text="New Collection Program" location="bottom">
              <template v-slot:activator="{ props }">
                <v-btn v-bind="props" icon color="primary" @click="goToCreate">
                  <v-icon icon="mdi-plus" />
                </v-btn>
              </template>
            </v-tooltip>
          </div>
        </div>

        <!-- Search and Filter Controls -->
        <v-card class="filters-card" border="md" elevation="0">
          <v-card-text class="pa-4">
            <v-row dense align="center">
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="searchTerm"
                  placeholder="Search programs..."
                  prepend-inner-icon="mdi-magnify"
                  clearable
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="6" sm="3">
                <v-select
                  v-model="sortBy"
                  :items="sortByOptions"
                  label="Sort by"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="6" sm="3">
                <v-select
                  v-model="sortOrder"
                  :items="sortOrderOptions"
                  label="Order"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>
            <div class="filters-card__footer mt-3">
              <p class="filters-card__meta">
                Showing {{ apps.length }} of {{ totalApps }} programs
              </p>
              <v-btn
                variant="text"
                size="small"
                :prepend-icon="showArchived ? 'mdi-archive-off' : 'mdi-archive'"
                @click="showArchived = !showArchived"
              >
                {{ showArchived ? 'Hide archived' : 'Show archived' }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <!-- Loading state -->
        <v-progress-linear v-if="isLoading" class="mt-6" color="primary" indeterminate />

        <!-- Empty state -->
        <div v-else-if="hasNoResults" class="empty-state">
          <div class="empty-state__icon">
            <v-icon icon="mdi-clipboard-text-outline" size="48" color="primary" />
          </div>
          <template v-if="searchTerm">
            <h3 class="empty-state__title">No programs found</h3>
            <p class="empty-state__description">
              No collection programs match "<strong>{{ searchTerm }}</strong>".
              Try a different search term.
            </p>
          </template>
          <template v-else>
            <h3 class="empty-state__title">Create your first collection program</h3>
            <p class="empty-state__description">
              Collection programs define how field data is captured — the forms, entity types,
              and sync configuration. Create one to start collecting data.
            </p>
            <div class="empty-state__actions">
              <v-btn color="primary" size="large" prepend-icon="mdi-plus" @click="goToCreate">
                New Program
              </v-btn>
              <v-btn variant="tonal" size="large" prepend-icon="mdi-upload" @click="showImportDialog = true">
                Import JSON
              </v-btn>
            </div>
          </template>
        </div>

        <!-- Programs Grid -->
        <div v-else class="apps-grid">
          <AppCard
            v-for="(app, i) in apps"
            :key="app.id"
            :app="app"
            :style="{ '--i': i }"
            @app-deleted="fetchApps"
          />
        </div>

        <!-- Pagination -->
        <div v-if="meta.totalPages > 1" class="pagination">
          <v-pagination
            v-model="page"
            :length="meta.totalPages"
            total-visible="5"
            rounded="circle"
            density="comfortable"
          />
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="dashboard-sidebar">
        <OverviewPanel
          :total-programs="totalApps"
          :total-entities="totalEntities"
          :sync-enabled-count="syncEnabledCount"
          :local-only-count="localOnlyCount"
          :is-loading="isLoading"
        />

      </aside>
    </div>

    <!-- Import JSON Dialog -->
    <v-dialog v-model="showImportDialog" :max-width="540">
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon icon="mdi-upload" color="primary" />
          Import JSON Configuration
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">
            Upload an exported JSON configuration file to create a new collection program.
          </p>
          <v-file-input
            v-model="jsonFile"
            accept=".json"
            label="Choose JSON file"
            prepend-icon="mdi-file-document"
            variant="outlined"
            :error-messages="jsonFileError ?? undefined"
            :loading="isUploadingJson"
            :disabled="isUploadingJson"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn
            variant="text"
            @click="showImportDialog = false; jsonFile = null; jsonFileError = null"
          >
            Cancel
          </v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            :loading="isUploadingJson"
            :disabled="!jsonFile || isUploadingJson"
            @click="uploadJsonConfig()"
          >
            Import
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Duplicate Program Confirmation Dialog -->
    <v-dialog v-model="showDuplicateConfirm" :max-width="480">
      <v-card>
        <v-card-title class="text-h6">Program Already Exists</v-card-title>
        <v-card-text>
          <p>
            A program with this name already exists (ID: <strong>{{ pendingDuplicateId }}</strong>).
            Continuing will overwrite the existing program. Do you want to proceed?
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelDuplicateConfirm">Cancel</v-btn>
          <v-btn color="warning" variant="tonal" @click="confirmImportOverwrite">Overwrite</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.app-dashboard {
  padding-bottom: var(--spacing-2xl);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: var(--spacing-xl);
  align-items: start;
}

.dashboard-sidebar {
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.filters-card {
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.filters-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filters-card__meta {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  margin-top: var(--spacing-xl);
}

.empty-state__icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--brand-100);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-lg);
}

.empty-state__title {
  font-family: var(--font-family-display);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  margin: 0 0 var(--spacing-sm);
  color: var(--text-main);
}

.empty-state__description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  max-width: 420px;
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg);
}

.empty-state__actions {
  display: flex;
  gap: var(--spacing-sm);
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.apps-grid > * {
  animation: card-rise 280ms ease-out both;
  animation-delay: calc(min(var(--i, 0), 12) * 50ms);
}

@keyframes card-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .apps-grid > * {
    animation: none;
  }
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: var(--spacing-lg);
}

@media (max-width: 1280px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-sidebar {
    position: static;
  }
}
</style>
