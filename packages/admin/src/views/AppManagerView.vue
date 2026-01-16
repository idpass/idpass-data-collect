<script setup lang="ts">
import {
  getApps as getAppsApi,
  type AppListItem,
  type AppListMeta,
  type AppListParams,
} from '@/api'
import AppCard from '@/components/AppCard.vue'
import OverviewPanel from '@/components/OverviewPanel.vue'
import RecentActivity, { type ActivityItem } from '@/components/RecentActivity.vue'
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

// Generate recent activity from apps data
const recentActivities = computed<ActivityItem[]>(() => {
  // Create activity items from apps - this is a simplified version
  // In a full implementation, this would come from a dedicated API endpoint
  return apps.value.slice(0, 10).map((app, index) => ({
    id: `activity-${app.id}-${index}`,
    programId: app.id,
    programName: app.name,
    type: 'entity_created' as const,
    description: `${app.entitiesCount || 0} entities in ${app.name}`,
    timestamp: new Date(Date.now() - index * 3600000).toISOString(),
  }))
})

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

watch(searchTerm, () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }
  searchDebounce = setTimeout(() => {
    page.value = 1
    fetchApps()
  }, 300)
})

const goToCreate = () => {
  router.push({ name: 'create' })
}

const handleActivityClick = (activity: ActivityItem) => {
  router.push({ name: 'app-details', params: { id: activity.programId } })
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
    <v-row dense>
      <!-- Main Content (left ~70%) -->
      <v-col cols="12" lg="8">
        <!-- Header with title and icon buttons -->
        <div class="dashboard-header">
          <div class="dashboard-header__text">
            <h1 class="dashboard-title">Collection Programs</h1>
            <p class="dashboard-subtitle">Manage and monitor your form applications</p>
          </div>
          <div class="dashboard-header__actions">
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
            <p class="filters-card__meta mt-3">
              Showing {{ apps.length }} of {{ totalApps }} programs
            </p>
          </v-card-text>
        </v-card>

        <!-- Loading state -->
        <v-progress-linear v-if="isLoading" class="mt-6" color="primary" indeterminate />

        <!-- Empty state -->
        <v-alert v-else-if="hasNoResults" class="mt-6" border="start" variant="tonal" type="info">
          No collection programs match your filters. Try adjusting your search or
          <a class="text-primary" style="cursor: pointer" @click="goToCreate"
            >create a new program</a
          >.
        </v-alert>

        <!-- Programs Grid -->
        <v-row v-else class="apps-grid" dense>
          <v-col v-for="app in apps" :key="app.id" cols="12" md="6">
            <AppCard :app="app" @app-deleted="fetchApps" />
          </v-col>
        </v-row>

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
      </v-col>

      <!-- Sidebar (right ~30%) -->
      <v-col cols="12" lg="4">
        <div class="sidebar">
          <OverviewPanel
            :total-programs="totalApps"
            :total-entities="totalEntities"
            :sync-enabled-count="syncEnabledCount"
            :local-only-count="localOnlyCount"
            :is-loading="isLoading"
          />

          <RecentActivity
            class="mt-4"
            :activities="recentActivities"
            :is-loading="isLoading"
            @activity-click="handleActivityClick"
          />
        </div>
      </v-col>
    </v-row>
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
  margin-bottom: 16px;
}

.dashboard-header__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dashboard-title {
  font-size: clamp(1.5rem, 1.4rem + 0.5vw, 1.875rem);
  font-weight: 600;
  margin: 0;
}

.dashboard-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.6);
}

.dashboard-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filters-card {
  border-radius: 14px;
}

.filters-card__meta {
  font-size: 0.8rem;
  color: rgba(0, 0, 0, 0.5);
  margin: 0;
}

.apps-grid {
  margin-top: 16px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.sidebar {
  position: sticky;
  top: 80px;
}

@media (max-width: 1280px) {
  .sidebar {
    position: static;
    margin-top: 24px;
  }
}

@media (max-width: 960px) {
  .dashboard-header {
    align-items: flex-start;
  }
  .dashboard-header__actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
