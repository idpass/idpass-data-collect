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
import { computed, ref } from 'vue'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import AdapterConfigFields from '@/components/AdapterConfigFields.vue'
import FieldsInput from '@/components/FieldsInput.vue'
import { testOpenSppV2Connection } from '@/api/opensppV2'

const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const isTestingConnection = ref(false)
const connectionStatus = ref<'idle' | 'success' | 'error'>('idle')
const connectionError = ref<string | null>(null)

const syncTypeOptions = [
  ...(import.meta.env.DEV ? [{ title: 'Mock Registry Server', value: 'mock' }] : []),
  { title: 'OpenSPP V1', value: 'openspp-v1-adapter' },
  { title: 'OpenSPP v2', value: 'openspp-v2-adapter' },
  { title: 'OpenFn', value: 'openfn-adapter' },
]

const isV2Adapter = computed(() => {
  return draftStore.draft.externalSync?.type === 'openspp-v2-adapter'
})

const canTestConnection = computed(() => {
  if (!isV2Adapter.value) return false
  const config = draftStore.draft.externalSync?.adapterConfig
  const url = draftStore.draft.externalSync?.url
  return !!(url && config?.clientId && config?.clientSecret)
})

const testConnection = async () => {
  if (!canTestConnection.value) return

  isTestingConnection.value = true
  connectionStatus.value = 'idle'
  connectionError.value = null

  try {
    const url = draftStore.draft.externalSync?.url
    const config = draftStore.draft.externalSync?.adapterConfig

    if (!url || !config?.clientId || !config?.clientSecret) {
      throw new Error('Missing required configuration')
    }

    const result = await testOpenSppV2Connection({
      baseUrl: url,
      clientId: config.clientId as string,
      clientSecret: config.clientSecret as string,
    })

    if (result.success) {
      connectionStatus.value = 'success'
      snackBarStore.showSnackbar('Connection successful', 'success')
    } else {
      connectionStatus.value = 'error'
      connectionError.value = result.error || 'Connection failed'
      snackBarStore.showSnackbar(result.error || 'Connection failed', 'error')
    }
  } catch (error) {
    connectionStatus.value = 'error'
    connectionError.value = error instanceof Error ? error.message : 'Connection failed'
    snackBarStore.showSnackbar(connectionError.value, 'error')
  } finally {
    isTestingConnection.value = false
  }
}

const getAdapterDescription = computed(() => {
  const type = draftStore.draft.externalSync?.type
  switch (type) {
    case 'openspp-v2-adapter':
      return 'Connect to OpenSPP using the modern REST API with OAuth2 authentication. This adapter provides access to Studio custom fields and improved performance.'
    case 'openspp-v1-adapter':
      return 'Connect to OpenSPP using the JSON-RPC/Odoo API.'
    case 'openfn-adapter':
      return 'Connect to OpenFn for workflow-based data integration.'
    case 'mock':
      return 'Reference V2 HTTP adapter for the mock registry server (examples/mock-server) — uses OAuth2 client credentials and a PublicSchema-aligned REST API.'
    default:
      return null
  }
})
</script>

<template>
  <div class="integration-step">
    <p class="step-description">
      Configure the external system integration for your collection program. Select an adapter type
      and provide the connection details. This information will be used for data synchronization
      and to fetch available fields for mapping.
    </p>

    <v-form class="integration-form">
      <!-- Sync Type -->
      <v-select
        v-model="draftStore.draft.externalSync.type"
        :items="syncTypeOptions"
        label="Integration Type *"
        placeholder="Select an integration adapter"
        hint="Choose the external system you want to integrate with."
        persistent-hint
        :error-messages="draftStore.errors.integration?.type"
        variant="outlined"
        density="comfortable"
        clearable
      />

      <!-- Adapter Description -->
      <v-alert
        v-if="getAdapterDescription"
        type="info"
        variant="tonal"
        density="compact"
      >
        {{ getAdapterDescription }}
      </v-alert>

      <!-- Sync URL -->
      <v-text-field
        v-model="draftStore.draft.externalSync.url"
        label="API URL *"
        placeholder="https://openspp.example.com"
        hint="The base URL of the external system's API endpoint."
        persistent-hint
        :error-messages="draftStore.errors.integration?.url"
        variant="outlined"
        density="comfortable"
      />

      <!-- Adapter-specific configuration -->
      <div v-if="draftStore.draft.externalSync.type" class="form-section">
        <label class="form-label">Adapter Configuration</label>
        <v-card variant="outlined" class="pa-4">
          <AdapterConfigFields
            :adapter-type="draftStore.draft.externalSync.type"
            v-model="draftStore.draft.externalSync.adapterConfig!"
          />
        </v-card>
      </div>

      <!-- V2 Connection Test -->
      <div v-if="isV2Adapter" class="form-section">
        <v-divider class="mb-4" />
        <div class="connection-test">
          <div class="connection-test__info">
            <label class="form-label">Connection Test</label>
            <p class="form-hint">
              Verify your OAuth2 credentials before proceeding.
            </p>
          </div>
          <v-btn
            :loading="isTestingConnection"
            :disabled="!canTestConnection"
            :color="connectionStatus === 'success' ? 'success' : connectionStatus === 'error' ? 'error' : 'primary'"
            variant="outlined"
            @click="testConnection"
          >
            <v-icon
              v-if="connectionStatus === 'success'"
              start
              icon="mdi-check-circle"
            />
            <v-icon
              v-else-if="connectionStatus === 'error'"
              start
              icon="mdi-alert-circle"
            />
            <v-icon
              v-else
              start
              icon="mdi-connection"
            />
            {{ connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Retry' : 'Test Connection' }}
          </v-btn>
        </div>

        <v-alert
          v-if="connectionStatus === 'success'"
          type="success"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          Successfully authenticated with OpenSPP V2 API. You can proceed to configure forms.
        </v-alert>

        <v-alert
          v-if="connectionStatus === 'error' && connectionError"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          {{ connectionError }}
        </v-alert>
      </div>

      <!-- Legacy extra fields -->
      <v-expansion-panels
        v-if="draftStore.draft.externalSync.extraFields?.length"
        class="form-section"
      >
        <v-expansion-panel>
          <v-expansion-panel-title>
            <span class="text-body-2">
              Legacy Extra Fields ({{ draftStore.draft.externalSync.extraFields.length }})
            </span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <FieldsInput v-model="draftStore.draft.externalSync.extraFields" :as-array="true" />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-form>
  </div>
</template>

<style scoped>
.integration-step {
  max-width: 800px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}

.integration-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-label {
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--text-main);
  margin-bottom: var(--spacing-xs);
}

.connection-test {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.connection-test__info {
  flex: 1;
}
</style>
