<script setup lang="ts">
import { getAppConfigJsonUrl, getAppQrCodeUrl, deleteApp as deleteAppApi } from '@/api'
import { computed, ref, watch } from 'vue'
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

const showQrDialog = ref(false)
const qrError = ref(false)

const emit = defineEmits<{
  (e: 'appDeleted'): void
}>()

const menu = ref(false)
const showArchiveDialog = ref(false)

const handleArchive = () => {
  menu.value = false
  showArchiveDialog.value = true
}

const confirmArchive = async () => {
  try {
    await deleteAppApi(app.id)
    emit('appDeleted')
    showArchiveDialog.value = false
  } catch (error) {
    console.error('Error:', error)
    alert('Error archiving app config')
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
    }
  }

  const requiresAuth = app.externalSync.auth === 'basic'

  return {
    label: 'Sync enabled',
    color: requiresAuth ? 'warning' : 'success',
    icon: requiresAuth ? 'mdi-shield-key-outline' : 'mdi-sync',
  }
})

const downloadUrl = computed(() => getAppConfigJsonUrl(app.artifactId))
const qrUrl = computed(() => getAppQrCodeUrl(app.artifactId))

const handleQrError = () => {
  qrError.value = true
}

watch(showQrDialog, (isOpen) => {
  if (isOpen) {
    qrError.value = false
  }
})
</script>

<template>
  <v-card class="app-card" border="md" elevation="0" @click="openDetails(app.id)">
    <!-- Header with name and menu -->
    <v-card-text class="app-card__header">
      <div class="app-card__header-main">
        <div class="app-card__avatar">{{ avatarLabel }}</div>
        <div class="app-card__header-text">
          <h3 class="app-card__name" :title="app.name">{{ app.name }}</h3>
          <p class="app-card__id" :title="app.id">{{ app.id }}</p>
        </div>
      </div>
      <v-menu v-model="menu" location="bottom end">
        <template #activator="{ props }">
          <v-btn icon="mdi-dots-vertical" variant="text" size="small" v-bind="props" @click.stop />
        </template>
        <v-list density="compact">
          <v-list-item @click="editApp(app.id)" prepend-icon="mdi-pencil" title="Edit" />
          <v-list-item @click="copyApp(app.id)" prepend-icon="mdi-content-copy" title="Duplicate" />
          <v-list-item
            :href="downloadUrl"
            download
            prepend-icon="mdi-download"
            title="Download"
            @click.stop
          />
          <v-divider class="my-1" />
          <v-list-item
            @click="handleArchive()"
            prepend-icon="mdi-archive"
            title="Archive"
            class="text-warning"
          />
        </v-list>
      </v-menu>
    </v-card-text>

    <!-- Inline metrics and status -->
    <v-card-text class="app-card__body">
      <div class="app-card__metrics">
        <v-chip :color="syncDetails.color" variant="tonal" size="small" density="comfortable">
          <v-icon :icon="syncDetails.icon" size="14" start />
          {{ syncDetails.label }}
        </v-chip>
        <v-chip variant="tonal" color="primary" size="small">
          <v-icon icon="mdi-database" size="14" start />
          {{ app.entitiesCount || 0 }}
        </v-chip>
        <v-chip variant="outlined" size="small"> v{{ app.version || 'N/A' }} </v-chip>
      </div>
      <p v-if="app.description" class="app-card__description">
        {{ app.description }}
      </p>
    </v-card-text>

    <!-- Actions -->
    <v-card-actions class="app-card__actions">
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-qrcode"
        @click.stop="showQrDialog = true"
      >
        QR Code
      </v-btn>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        color="primary"
        append-icon="mdi-chevron-right"
        @click.stop="openDetails(app.id)"
      >
        Details
      </v-btn>
    </v-card-actions>
  </v-card>

  <!-- QR Dialog -->
  <v-dialog v-model="showQrDialog" max-width="360">
    <v-card>
      <v-card-title class="text-h6">Scan to deploy</v-card-title>
      <v-card-text class="text-center">
        <v-img
          :src="qrUrl"
          alt="QR Code"
          max-width="200"
          class="mx-auto my-4"
          @error="handleQrError"
        >
          <template v-if="qrError" #placeholder>
            <div class="text-center pa-4">
              <v-icon icon="mdi-alert-circle" size="48" color="error" class="mb-2" />
              <p class="text-body-2 text-error">Failed to load QR code</p>
              <p class="text-caption text-medium-emphasis mt-2">
                Please ensure the backend is accessible.
              </p>
            </div>
          </template>
        </v-img>
        <p v-if="!qrError" class="text-body-2 text-medium-emphasis">
          Share this code with field teams to load the configuration.
        </p>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="showQrDialog = false">Close</v-btn>
        <v-btn
          variant="flat"
          color="primary"
          :href="downloadUrl"
          target="_blank"
          prepend-icon="mdi-download"
        >
          Download
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Archive Dialog -->
  <v-dialog v-model="showArchiveDialog" max-width="420">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-archive" start />
        Archive Program
      </v-card-title>
      <v-card-text>
        <p>
          Are you sure you want to archive <strong>{{ app.name }}</strong
          >?
        </p>
        <p class="mt-2 text-medium-emphasis text-body-2">
          The program will be hidden from the main list but data will remain accessible.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showArchiveDialog = false">Cancel</v-btn>
        <v-btn color="warning" variant="tonal" @click="confirmArchive">Archive</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.app-card {
  border-radius: 16px;
  overflow: hidden;
  background: var(--v-theme-surface);
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    transform 0.15s ease;
}

.app-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.app-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
}

.app-card__header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.app-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(33, 150, 243, 0.12);
  color: rgb(25, 118, 210);
  font-weight: 600;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-card__header-text {
  min-width: 0;
  flex: 1;
}

.app-card__name {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__id {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__body {
  padding-top: 0;
  padding-bottom: 12px;
}

.app-card__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.app-card__description {
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.app-card__actions {
  padding-top: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
