<script setup lang="ts">
import {
  getAppConfigJsonUrl,
  getAppQrCodeUrl,
  deleteApp as deleteAppApi,
  externalSync as externalSyncApi,
} from '@/api'
import BasicAuthDialog from '@/components/BasicAuthDialog.vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

interface Props {
  app: {
    id: string
    name: string
    version: string
    entitiesCount: number
    externalSync: Record<string, string>
  }
}

const { app } = defineProps<Props>()

const showDialog = ref(false)

const emit = defineEmits<{
  (e: 'appDeleted'): void
}>()

const menu = ref(false)
const menuPosition = ref({ x: 0, y: 0 })

const deleteApp = async (id: string) => {
  try {
    await deleteAppApi(id)
    emit('appDeleted')
  } catch (error) {
    console.error('Error:', error)
    alert('Error deleting app config')
  }
}

const externalSync = async (id: string) => {
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

const editApp = async (id: string) => {
  router.push(`/edit/${id}`)
}

const copyApp = async (id: string) => {
  router.push(`/copy/${id}`)
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex justify-space-between align-center">
      {{ app.name }}
      <v-menu
        v-model="menu"
        :position-x="menuPosition.x"
        :position-y="menuPosition.y"
        location="end"
      >
        <template v-slot:activator="{ props }">
          <v-btn icon="mdi-dots-vertical" variant="text" v-bind="props" @click="menu = true" />
        </template>
        <v-list>
          <v-list-item
            :href="getAppConfigJsonUrl(app.id)"
            download
            prepend-icon="mdi-download"
            title="Download Config"
          />
          <v-list-item @click="externalSync(app.id)" prepend-icon="mdi-sync" title="Sync" />
          <v-list-item @click="editApp(app.id)" prepend-icon="mdi-pencil" title="Edit" />
          <v-list-item @click="copyApp(app.id)" prepend-icon="mdi-content-copy" title="Copy" />
          <v-list-item
            @click="deleteApp(app.id)"
            prepend-icon="mdi-delete"
            title="Delete"
            color="red"
          />
        </v-list>
      </v-menu>
    </v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item>
          <v-list-item-title>ID</v-list-item-title>
          <v-list-item-subtitle>{{ app.id }}</v-list-item-subtitle>
        </v-list-item>
        <v-list-item>
          <v-list-item-title>Version</v-list-item-title>
          <v-list-item-subtitle>{{ app.version }}</v-list-item-subtitle>
        </v-list-item>
        <v-list-item>
          <v-list-item-title>Entities</v-list-item-title>
          <v-list-item-subtitle>{{ app.entitiesCount || 0 }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-text class="text-center">
      <v-img :src="getAppQrCodeUrl(app.id)" alt="QR Code" max-width="100" class="mx-auto"></v-img>
    </v-card-text>
  </v-card>

  <BasicAuthDialog
    :title="`Sync ${app.name}`"
    :description="`Enter your credentials to sync ${app.name}`"
    v-model="showDialog"
    @submit="onCredentialsSubmit"
  />
</template>
