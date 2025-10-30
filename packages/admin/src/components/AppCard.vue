<script setup lang="ts">
import {
  getAppConfigJsonUrl,
  getAppQrCodeUrl,
  deleteApp as deleteAppApi,
  externalSync as externalSyncApi,
} from '@/api'
import BasicAuthDialog from '@/components/BasicAuthDialog.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

interface Props {
  app: {
    id: string
    artifactId: string
    name: string
    version: string
    entitiesCount: number
    externalSync: Record<string, string>
    description: string
  }
}

const { app } = defineProps<Props>()

const showDialog = ref(false)
const showQrDialog = ref(false)

const emit = defineEmits<{
  (e: 'appDeleted'): void
}>()

const menu = ref(false)

const deleteApp = async (id: string) => {
  menu.value = false
  try {
    await deleteAppApi(id)
    emit('appDeleted')
  } catch (error) {
    console.error('Error:', error)
    alert('Error deleting app config')
  }
}

const externalSync = async (id: string) => {
  menu.value = false
  try {
    if (app.externalSync?.auth === 'basic') {
      showDialog.value = true
      return
    }

    await externalSyncApi(id)
  } catch (error) {
    console.error('Error:', error)
  }
}

const onCredentialsSubmit = async (credentials: { username: string; password: string }) => {
  try {
    await externalSyncApi(app.id, credentials)
  } catch (error) {
    console.error('Error:', error)
  }
}

const openDetails = (id: string) => {
  menu.value = false
  router.push({ name: 'app-details', params: { id } })
}

const editApp = async (id: string) => {
  menu.value = false
  router.push(`/edit/${id}`)
}

const copyApp = async (id: string) => {
  menu.value = false
  router.push(`/copy/${id}`)
}

const avatarLabel = computed(() => (app.name ? app.name.charAt(0).toUpperCase() : 'A'))

const syncDetails = computed(() => {
  if (!app.externalSync || Object.keys(app.externalSync).length === 0) {
    return {
      label: 'Local only',
      color: 'grey-darken-2',
      icon: 'mdi-lan-disconnect',
      description: 'Data collected remains on device until manually exported.',
    }
  }

  const requiresAuth = app.externalSync.auth === 'basic'

  return {
    label: 'Sync enabled',
    color: requiresAuth ? 'warning' : 'success',
    icon: requiresAuth ? 'mdi-shield-key-outline' : 'mdi-sync',
    description: app.description || ''
  }
})

const metricItems = computed(() => [
  {
    label: 'Entities captured',
    value: app.entitiesCount ?? 0,
    icon: 'mdi-account-group-outline',
  },
  {
    label: 'Version',
    value: app.version || 'Not specified',
    icon: 'mdi-tag-outline',
  },
  {
    label: 'Config ID',
    value: app.id,
    icon: 'mdi-identifier',
  },
  {
    label: 'Artifact ID',
    value: app.artifactId,
    icon: 'mdi-package-variant',
  },
])

const downloadUrl = computed(() => getAppConfigJsonUrl(app.artifactId))
const qrUrl = computed(() => getAppQrCodeUrl(app.artifactId))
</script>

<template>
  <v-card class="app-card" border="md" elevation="0">
    <v-card-text class="app-card__header">
      <div class="app-card__header-main">
        <div class="app-card__avatar">{{ avatarLabel }}</div>
        <div>
          <h3 class="app-card__name" :title="app.name">{{ app.name }}</h3>
          <p class="app-card__id" :title="app.id">Config ID • {{ app.id }}</p>
        </div>
      </div>
      <div class="app-card__header-actions">
        <v-chip
          class="app-card__status"
          :color="syncDetails.color"
          variant="tonal"
          size="small"
          density="comfortable"
        >
          <v-icon :icon="syncDetails.icon" size="16" start />
          {{ syncDetails.label }}
        </v-chip>
        <v-menu v-model="menu" location="bottom end">
          <template #activator="{ props }">
            <v-btn icon="mdi-dots-vertical" variant="text" v-bind="props" />
          </template>
          <v-list density="compact">
            <v-list-item
              :href="downloadUrl"
              download
              prepend-icon="mdi-download"
              title="Download config"
            />
            <v-list-item @click="externalSync(app.id)" prepend-icon="mdi-sync" title="Sync" />
            <v-list-item @click="editApp(app.id)" prepend-icon="mdi-pencil" title="Edit" />
            <v-list-item @click="copyApp(app.id)" prepend-icon="mdi-content-copy" title="Duplicate" />
            <v-list-item
              @click="deleteApp(app.id)"
              prepend-icon="mdi-delete"
              title="Delete"
              color="error"
            />
          </v-list>
        </v-menu>
      </div>
    </v-card-text>

    <v-card-text class="app-card__summary">
      <div class="app-card__summary-tags">
        <v-chip variant="tonal" color="primary" size="small">
          <v-icon icon="mdi-account-multiple" size="16" start />
          {{ app.entitiesCount || 0 }} entities
        </v-chip>
        <v-chip variant="outlined" size="small">
          Version {{ app.version || 'N/A' }}
        </v-chip>
      </div>
      <p class="app-card__summary-text">{{ syncDetails.description }}</p>
    </v-card-text>

    <v-divider />

    <v-card-text class="app-card__metrics">
      <div v-for="metric in metricItems" :key="metric.label" class="app-card__metric">
        <div class="app-card__metric-icon">
          <v-icon :icon="metric.icon" size="20" />
        </div>
        <div class="app-card__metric-content">
          <p class="app-card__metric-label">{{ metric.label }}</p>
          <p class="app-card__metric-value" :title="String(metric.value)">{{ metric.value }}</p>
        </div>
      </div>
    </v-card-text>

    <v-divider />

    <v-card-actions class="app-card__footer">
      <div class="app-card__footer-actions">
        <v-btn variant="outlined" color="primary" prepend-icon="mdi-qrcode" @click="showQrDialog = true">
          Show QR
        </v-btn>
        <v-btn variant="text" color="primary" prepend-icon="mdi-link-variant" :href="downloadUrl" target="_blank">
          Deployment URL
        </v-btn>
      </div>
      <v-btn variant="text" color="primary" prepend-icon="mdi-arrow-right" @click="openDetails(app.id)">
        View details
      </v-btn>
    </v-card-actions>
  </v-card>

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
        <v-btn variant="flat" color="primary" :href="downloadUrl" target="_blank" prepend-icon="mdi-download">
          Download JSON
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <BasicAuthDialog
    :title="`Sync ${app.name}`"
    :description="`Enter your credentials to sync ${app.name}`"
    v-model="showDialog"
    @submit="onCredentialsSubmit"
  />
</template>

<style scoped>
.app-card {
  border-radius: 20px;
  overflow: hidden;
  background: var(--v-theme-surface);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.app-card__header-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(33, 150, 243, 0.12);
  color: rgb(25, 118, 210);
  font-weight: 600;
  font-size: 1.125rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-card__name {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 4px;
}

.app-card__id {
  font-size: 0.8125rem;
  color: rgba(0, 0, 0, 0.54);
  margin: 0;
}

.app-card__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-card__status {
  font-weight: 500;
}

.app-card__summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-card__summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.app-card__summary-text {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
}

.app-card__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.app-card__metric {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
}

.app-card__metric-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.04);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-card__metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
  margin: 0 0 4px;
}

.app-card__metric-value {
  font-size: 0.95rem;
  font-weight: 500;
  margin: 0;
  color: rgba(0, 0, 0, 0.8);
  word-break: break-word;
}

.app-card__metric-content {
  flex: 1;
  min-width: 0;
}

.app-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.app-card__footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 600px) {
  .app-card__metrics {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}
</style>
