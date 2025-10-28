<script setup lang="ts">
import {
  createApp as createAppApi,
  getApps as getAppsApi,
  type AppListItem,
  type AppListMeta,
  type AppListParams,
} from '@/api'
import AppCard from '@/components/AppCard.vue'
import { useAuthStore } from '@/stores/auth'
import { AxiosError } from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
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
const isLoading = ref(false)

const selectedFile = ref<File | null>(null)
const fileError = ref<string | null>(null)

const sortByOptions = [
  { title: 'Name', value: 'name' },
  { title: 'ID', value: 'id' },
  { title: 'Entities Count', value: 'entitiesCount' },
]

const sortOrderOptions = [
  { title: 'Ascending', value: 'asc' },
  { title: 'Descending', value: 'desc' },
]

const pageSizeOptions = [6, 12, 24, 48].map((value) => ({
  title: `${value} per page`,
  value,
}))

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

const fetchApps = async () => {
  isLoading.value = true
  try {
    const response = await getAppsApi({
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      search: searchTerm.value.trim() || undefined,
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

watch(
  searchTerm,
  () => {
    if (searchDebounce) {
      clearTimeout(searchDebounce)
    }
    searchDebounce = setTimeout(() => {
      page.value = 1
      fetchApps()
    }, 300)
  },
)

const uploadAppConfig = async () => {
  if (!selectedFile.value) return

  try {
    const fileReader = new FileReader()
    fileReader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        const json = JSON.parse(event.target?.result as string)

        if (!json || typeof json !== 'object') {
          throw new Error('Invalid app configuration format')
        }

        const formData = new FormData()
        formData.append(
          'config',
          new Blob([JSON.stringify(json)], {
            type: 'application/json',
          }),
          'config.json',
        )

        await createAppApi(formData)
        selectedFile.value = null
        fileError.value = null
        await fetchApps()
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) {
          authStore.logout()
          return
        }
        console.error('Error uploading configuration:', error)
        fileError.value =
          error instanceof Error ? error.message : 'Error uploading app configuration'
      }
    }

    fileReader.onerror = () => {
      console.error('Error reading file')
      fileError.value = 'Failed to read the configuration file'
    }

    fileReader.readAsText(selectedFile.value)
  } catch (error) {
    console.error('Error:', error)
    fileError.value = 'Error uploading app configuration'
  }
}

const goToCreate = () => {
  router.push({ name: 'create' })
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
    <div class="dashboard-header">
      <div class="dashboard-header__text">
        <h1 class="dashboard-title">Collection Programs</h1>
        <p class="dashboard-subtitle">Manage and monitor your form applications</p>
      </div>
      <div class="dashboard-header__actions">
        <v-btn
          class="dashboard-header__action"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-refresh"
          @click="fetchApps"
        >
          Refresh
        </v-btn>
        <v-btn
          class="dashboard-header__action"
          color="primary"
          prepend-icon="mdi-plus"
          @click="goToCreate"
        >
          New Collection Program
        </v-btn>
      </div>
    </div>

    <v-row class="mt-6" dense>
      <v-col cols="12" sm="6" md="4">
        <v-card class="stat-card" border="md" elevation="0">
          <v-card-text>
            <div class="stat-card__icon stat-card__icon--primary">
              <v-icon icon="mdi-view-dashboard-outline" size="26" />
            </div>
            <div class="stat-card__content">
              <p class="stat-card__label">Total Collection Programs</p>
              <p class="stat-card__value">{{ totalApps }}</p>
              <p class="stat-card__hint">Active records across all apps</p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-card class="stat-card" border="md" elevation="0">
          <v-card-text>
            <div class="stat-card__icon stat-card__icon--secondary">
              <v-icon icon="mdi-database-outline" size="26" />
            </div>
            <div class="stat-card__content">
              <p class="stat-card__label">Total Captured Entities</p>
              <p class="stat-card__value">{{ totalEntities }}</p>
              <p class="stat-card__hint">Summed across every program</p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-card class="stat-card" border="md" elevation="0">
          <v-card-text>
            <div class="stat-card__icon stat-card__icon--accent">
              <v-icon icon="mdi-sync-circle" size="26" />
            </div>
            <div class="stat-card__content">
              <p class="stat-card__label">External Sync Enabled</p>
              <p class="stat-card__value">{{ syncEnabledCount }}</p>
              <p class="stat-card__hint">{{ localOnlyCount }} local-only configurations</p>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="filters-card" border="md" elevation="0">
      <v-card-text>
        <div class="filters-card__header">
          <div>
            <p class="filters-card__eyebrow">Filters</p>
            <h2 class="filters-card__title">Refine collection programs</h2>
          </div>
          <p class="filters-card__meta">Showing {{ apps.length }} of {{ totalApps }} programs</p>
        </div>

        <v-row class="mt-4" dense>
          <v-col cols="12" md="5">
            <v-text-field
              v-model="searchTerm"
              label="Search collection programs"
              prepend-inner-icon="mdi-magnify"
              clearable
              variant="outlined"
              hint="Filter by name or ID"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="sortBy"
              :items="sortByOptions"
              label="Sort by"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="sortOrder"
              :items="sortOrderOptions"
              label="Order"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="pageSize"
              :items="pageSizeOptions"
              label="Page size"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
            />
          </v-col>
          <v-col cols="12" sm="6" md="1" class="d-flex align-end">
            <v-btn variant="text" color="primary" prepend-icon="mdi-close-circle" @click="searchTerm = ''">
              Clear
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="isLoading" class="mt-6" color="primary" indeterminate />

    <v-alert v-else-if="hasNoResults" class="mt-8" border="start" variant="tonal" type="info">
      No collection programs match your filters. Try adjusting your search.
    </v-alert>

    <v-row v-else class="apps-grid" dense>
      <v-col v-for="app in apps" :key="app.id" cols="12" md="6" xl="4">
        <AppCard :app="app" @app-deleted="fetchApps" />
      </v-col>
    </v-row>

    <div v-if="meta.totalPages > 1" class="pagination">
      <v-pagination v-model="page" :length="meta.totalPages" total-visible="7" rounded="circle" />
    </div>

    <v-card class="upload-card" border="md" elevation="0">
      <v-card-text>
        <div class="upload-card__header">
          <div>
            <p class="upload-card__eyebrow">Add new configuration</p>
            <h2 class="upload-card__title">Upload JSON configuration</h2>
            <p class="upload-card__subtitle">
              Import an exported JSON file to create a new collection program or update an existing one.
            </p>
          </div>
        </div>
        <v-file-input
          v-model="selectedFile"
          class="mt-4"
          accept=".json"
          label="Choose configuration file"
          prepend-icon="mdi-upload"
          variant="outlined"
          :error-messages="fileError"
          @change="uploadAppConfig"
        />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.app-dashboard {
  padding-bottom: 64px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.dashboard-header__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dashboard-title {
  font-size: clamp(1.75rem, 1.6rem + 0.5vw, 2.25rem);
  font-weight: 600;
  margin: 0;
}

.dashboard-subtitle {
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
}

.dashboard-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-header__action {
  min-width: 0;
}

.stat-card {
  height: 100%;
  border-radius: 16px;
  background: var(--v-theme-surface);
}

.stat-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.stat-card__icon--primary {
  background: rgba(33, 150, 243, 0.12);
  color: rgb(25, 118, 210);
}

.stat-card__icon--secondary {
  background: rgba(103, 58, 183, 0.12);
  color: rgb(81, 45, 168);
}

.stat-card__icon--accent {
  background: rgba(0, 150, 136, 0.12);
  color: rgb(0, 121, 107);
}

.stat-card__icon--neutral {
  background: rgba(96, 125, 139, 0.12);
  color: rgb(55, 71, 79);
}

.stat-card__icon--informational {
  background: rgba(30, 136, 229, 0.12);
  color: rgb(21, 101, 192);
}

.stat-card__label {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.45);
  margin: 0 0 4px;
}

.stat-card__value {
  font-size: 2.25rem;
  font-weight: 600;
  margin: 0;
}

.stat-card__hint {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.55);
  margin: 4px 0 0;
}

.filters-card {
  border-radius: 18px;
  margin-top: 32px;
}

.filters-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.filters-card__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
  margin: 0 0 4px;
}

.filters-card__title {
  font-size: 1.25rem;
  margin: 0;
  font-weight: 600;
}

.filters-card__meta {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
}

.apps-grid {
  margin-top: 24px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.upload-card {
  margin-top: 40px;
  border-radius: 18px;
}

.upload-card__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
  margin: 0;
}

.upload-card__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 6px 0 4px;
}

.upload-card__subtitle {
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
}

@media (max-width: 960px) {
  .dashboard-header {
    align-items: flex-start;
  }
  .dashboard-header__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
