<script setup lang="ts">
import {
  createApp as createAppApi,
  getApps as getAppsApi,
  getEntitiesCount as getEntitiesCountApi,
} from '@/api'
import AppCard from '@/components/AppCard.vue'
import { useAuthStore } from '@/stores/auth'
import { AxiosError } from 'axios'
import { onMounted, ref } from 'vue'

const authStore = useAuthStore()
const apps = ref<
  {
    id: string
    name: string
    entitiesCount: number
    version: string
    externalSync: Record<string, string>
  }[]
>([])
const selectedFile = ref<File | null>(null)
const fileError = ref<string | null>(null)

const getApps = async () => {
  try {
    const data = await getAppsApi()
    apps.value = data
    // get entities count for each app
    const entitiesCount = await Promise.all(
      apps.value.map(
        async (app: {
          id: string
          name: string
          externalSync: Record<string, string>
          version: string
        }) => {
          const data = await getEntitiesCountApi(app.id)
          return { ...app, entitiesCount: data.count }
        },
      ),
    )
    apps.value = entitiesCount
  } catch (error) {
    console.error('Error fetching apps:', error)
  }
}

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

        getApps()
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
  getApps()
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

        <!-- Apps List -->
        <v-row>
          <v-col v-for="app in apps" :key="app.id" cols="12" sm="6" md="4">
            <AppCard :app="app" @app-deleted="getApps" />
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>
