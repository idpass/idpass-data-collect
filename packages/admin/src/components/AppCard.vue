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
import { getAppConfigJsonUrl, getAppQrCodeUrl, archiveApp as archiveAppApi, restoreApp as restoreAppApi, purgeApp as purgeAppApi } from '@/api'
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
    archivedAt?: string | null
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
    await archiveAppApi(app.id)
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

const isDev = import.meta.env.DEV
const isArchived = computed(() => !!app.archivedAt)
const showPurgeDialog = ref(false)

const confirmPurge = async () => {
  try {
    await purgeAppApi(app.id)
    emit('appDeleted')
    showPurgeDialog.value = false
  } catch (error) {
    console.error('Error:', error)
    alert('Error permanently deleting program')
  }
}

const confirmRestore = async () => {
  try {
    await restoreAppApi(app.id)
    emit('appDeleted')
  } catch (error) {
    console.error('Error:', error)
    alert('Error restoring program')
  }
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
          <v-list-item prepend-icon="mdi-qrcode" title="Deploy to Device" @click.stop="showQrDialog = true" />
          <v-list-item
            :href="downloadUrl"
            download
            prepend-icon="mdi-download"
            title="Download"
            @click.stop
          />
          <v-divider class="my-1" />
          <v-list-item
            v-if="isArchived"
            @click="confirmRestore()"
            prepend-icon="mdi-archive-arrow-up"
            title="Restore"
            class="text-success"
          />
          <v-list-item
            v-else
            @click="handleArchive()"
            prepend-icon="mdi-archive"
            title="Archive"
            class="text-warning"
          />
          <template v-if="isDev">
            <v-divider class="my-1" />
            <v-list-item
              @click="showPurgeDialog = true"
              prepend-icon="mdi-delete-forever"
              title="Delete (Dev Only)"
              class="text-error"
            />
          </template>
        </v-list>
      </v-menu>
    </v-card-text>

    <!-- Metrics and description -->
    <v-card-text class="app-card__body">
      <div class="app-card__metrics">
        <v-chip :color="syncDetails.color" variant="tonal" size="small" density="comfortable">
          <v-icon :icon="syncDetails.icon" size="14" start />
          {{ syncDetails.label }}
        </v-chip>
        <v-chip variant="tonal" color="primary" size="small">
          <v-icon icon="mdi-account-multiple" size="14" start />
          {{ app.entitiesCount || 0 }} {{ app.entitiesCount === 1 ? 'entity' : 'entities' }}
        </v-chip>
        <v-chip variant="outlined" size="small"> v{{ app.version || 'N/A' }} </v-chip>
      </div>
      <p v-if="app.description" class="app-card__description">
        {{ app.description }}
      </p>
    </v-card-text>
  </v-card>

  <!-- QR Dialog -->
  <v-dialog v-model="showQrDialog" :max-width="400">
    <v-card>
      <v-card-title class="text-h6">Deploy to Device</v-card-title>
      <v-card-text class="text-center">
        <v-img
          :src="qrUrl"
          alt="Deployment QR code"
          max-width="200"
          class="mx-auto my-4"
          @error="handleQrError"
        >
          <template v-if="qrError" #placeholder>
            <div class="text-center pa-4">
              <v-icon icon="mdi-alert-circle" size="48" color="error" class="mb-2" />
              <p class="text-body-2 text-error">Could not load deployment code</p>
              <p class="text-caption text-medium-emphasis mt-2">
                Please ensure the backend is accessible.
              </p>
            </div>
          </template>
        </v-img>
        <p v-if="!qrError" class="text-body-2 text-medium-emphasis">
          Scan from the mobile app to load this program configuration onto a device.
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
          Download Config
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Archive Dialog -->
  <v-dialog v-model="showArchiveDialog" :max-width="400">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-archive" start />
        Archive Program
      </v-card-title>
      <v-card-text>
        <p>
          Are you sure you want to archive <strong>{{ app.name }}</strong>?
        </p>
        <p class="mt-2 text-medium-emphasis text-body-2">
          The program configuration will be removed. Collected entity data will not be affected.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showArchiveDialog = false">Cancel</v-btn>
        <v-btn color="warning" variant="tonal" @click="confirmArchive">Archive</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Purge Dialog (dev only) -->
  <v-dialog v-if="isDev" v-model="showPurgeDialog" :max-width="400">
    <v-card>
      <v-card-title class="text-h6">
        <v-icon icon="mdi-delete-forever" start color="error" />
        Permanently Delete
      </v-card-title>
      <v-card-text>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
          Development only — this action cannot be undone.
        </v-alert>
        <p>
          Permanently delete <strong>{{ app.name }}</strong> and all associated data?
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showPurgeDialog = false">Cancel</v-btn>
        <v-btn color="error" variant="tonal" @click="confirmPurge">Delete Forever</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.app-card {
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: var(--surface);
  cursor: pointer;
  transition:
    box-shadow var(--transition-normal),
    transform var(--transition-fast);
}

.app-card:hover {
  box-shadow: var(--shadow-floating);
  transform: translateY(-2px);
}

.app-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
}

.app-card__header-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;
}

.app-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: var(--brand-100);
  color: var(--brand-dark);
  font-weight: 600;
  font-size: var(--font-size-base);
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
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__id {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-card__body {
  padding-top: 0;
  padding-bottom: var(--spacing-md);
}

.app-card__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.app-card__description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: var(--line-height-normal);
}
</style>
