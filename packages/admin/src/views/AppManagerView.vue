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

const authStore = useAuthStore()

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
  <v-container>
    <v-row>
      <v-col cols="12">
        <h2 class="text-h4 mb-4">Apps</h2>

        <!-- Upload Section -->
        <v-card class="mb-4">
          <v-card-text>
            <v-file-input
              v-model="selectedFile"
              accept=".json"
              label="Upload JSON Config File"
              prepend-icon="mdi-upload"
              :error-messages="fileError"
              @change="uploadAppConfig"
            ></v-file-input>
          </v-card-text>
        </v-card>

        <!-- Filters -->
        <v-card class="mb-4">
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="searchTerm"
                  label="Search"
                  prepend-inner-icon="mdi-magnify"
                  clearable
                  hint="Filter by name, or ID"
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-select
                  v-model="sortBy"
                  :items="sortByOptions"
                  label="Sort By"
                  item-title="title"
                  item-value="value"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-select
                  v-model="sortOrder"
                  :items="sortOrderOptions"
                  label="Order"
                  item-title="title"
                  item-value="value"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" sm="6" md="2">
                <v-select
                  v-model="pageSize"
                  :items="pageSizeOptions"
                  label="Page Size"
                  item-title="title"
                  item-value="value"
                  density="comfortable"
                />
              </v-col>
              <v-col cols="12" class="text-end text-body-2">
                <span>Total Apps: {{ totalApps }}</span>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-progress-linear v-if="isLoading" class="mb-4" color="primary" indeterminate />

        <!-- Apps List -->
        <v-row v-if="apps.length">
          <v-col v-for="app in apps" :key="app.id" cols="12" sm="6" md="4">
            <AppCard :app="app" @app-deleted="fetchApps" />
          </v-col>
        </v-row>
        <v-alert v-else-if="hasNoResults" border="start" variant="tonal" type="info">
          No apps found. Try adjusting your filters.
        </v-alert>

        <div v-if="meta.totalPages > 1" class="d-flex justify-center mt-6">
          <v-pagination v-model="page" :length="meta.totalPages" total-visible="7" />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
