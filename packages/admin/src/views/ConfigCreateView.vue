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
import type { ExternalSyncField } from '@idpass/data-collect-core'
import merge from 'lodash/merge'
import set from 'lodash/set'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createApp as createAppApi,
  fetchOpenSppFieldsFromAPI,
  getApp,
  getApps as getAppsApi,
  updateApp as updateAppApi,
  type ParsedOpenSppField,
  type FieldMapping,
} from '@/api'
import FormBuilderDialog from '@/components/FormBuilderDialog.vue'
import FieldsInput from '@/components/FieldsInput.vue'
import AdapterConfigFields from '@/components/AdapterConfigFields.vue'
import FieldMappingDialog from '@/components/FieldMappingDialog.vue'
import { parseOpenSppProgramSpecification } from '@/utils/openSppImport'
import { useSnackBarStore } from '@/stores/snackBar'
import { useAuthStore } from '@/stores/auth'
import { AxiosError } from 'axios'

type EntityForm = {
  name: string
  title: string
  dependsOn: string
  formio: unknown
}
type ExternalSync = {
  type?: string
  url: string
  /** @deprecated Use adapterConfig instead */
  extraFields: ExternalSyncField[]
  /** Typed adapter configuration */
  adapterConfig?: Record<string, string | number | boolean>
  fieldMappings?: FieldMapping[]
}

type AuthConfig = {
  type: string
  fields: Record<string, string>
}

type ConfigSchema = {
  artifactId?: string
  name: string
  description: string
  version: string
  entityForms: EntityForm[]
  externalSync: ExternalSync
  authConfigs: AuthConfig[]
}

const snackBarStore = useSnackBarStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const isEdit = ref(false)
const isCopy = ref(false)
const showBuilder = ref(false)
const activeTab = ref('form')
const configFormTab = ref('basic')

const form = ref<ConfigSchema>({
  artifactId: undefined,
  name: '',
  description: '',
  version: '1',
  entityForms: [],
  externalSync: {
    type: undefined,
    url: '',
    extraFields: [],
    adapterConfig: {},
  },
  authConfigs: [],
})
const circularDepError = ref(false)
const selectedForFormBuilder = ref<{ name: string; title: string; formio?: object } | null>(null)
const nameError = ref('')
const descriptionError = ref('')
const entityFormsError = ref('')
const itemEntityFormsError = ref<{
  [key: string]: { name: string; title: string; formio: string }
}>({})
const typeError = ref('')
const urlError = ref('')
const versionError = ref('')
const authConfigsError = ref<{
  [key: string]: { type: string; fieldsError: string; fields: Record<string, string> }
}>({})
const isValid = ref(false)
const isReady = ref(false)
const specImportFiles = ref<File[] | null>(null)
const isImportingSpec = ref(false)

// JSON Import state
const jsonFile = ref<File | null>(null)
const jsonFileError = ref<string | null>(null)
const isUploadingJson = ref(false)

// OpenSPP Field Mapping
const showFieldMapping = ref(false)
const isFetchingOpenSppFields = ref(false)
const opensppFields = ref<ParsedOpenSppField[]>([])
const selectedFormForMapping = ref<EntityForm | null>(null)

const pageTitle = computed(() => {
  if (isEdit.value) return 'Edit Collection Program'
  if (isCopy.value) return 'Duplicate Collection Program'
  return 'New Collection Program'
})

onMounted(async () => {
  const id = route.params.id
  isEdit.value = route.name?.toString().includes('edit') || false
  isCopy.value = route.name?.toString().includes('copy') || false

  if (id) {
    const config = await getApp(id as string)
    form.value = merge(form.value, config)
    if (isCopy.value) {
      form.value.name = config.name + ' Copy'
    }
  }
  isReady.value = true
})

// watch form.entityForms for circular dependencies
watch(
  () => form.value.entityForms,
  (newVal) => {
    const dependencyMap = new Map<string, string>()
    newVal.forEach((form) => {
      if (form.name && form.dependsOn) {
        dependencyMap.set(form.name, form.dependsOn)
      }
    })

    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (node: string): boolean => {
      if (!dependencyMap.has(node)) return false
      if (recursionStack.has(node)) return true
      if (visited.has(node)) return false

      visited.add(node)
      recursionStack.add(node)

      const dependency = dependencyMap.get(node)
      if (dependency && hasCycle(dependency)) {
        return true
      }

      recursionStack.delete(node)
      return false
    }

    for (const [node] of dependencyMap) {
      if (hasCycle(node)) {
        circularDepError.value = true
        return
      }
    }

    circularDepError.value = false
  },
  { deep: true },
)

const getDependsOnValues = (currentEntityForm: EntityForm) => {
  const values = form.value.entityForms
    .filter(
      (entityForm) =>
        entityForm.name !== currentEntityForm.name &&
        entityForm.name !== '' &&
        entityForm.title !== '',
    )
    .filter((entityForm) => entityForm.name !== currentEntityForm.name)
    .filter((entityForm) => entityForm.dependsOn !== currentEntityForm.name)
    .map((entityForm) => ({ name: entityForm.name, title: entityForm.title }))
  return values
}

const createConfig = async () => {
  try {
    isValid.value = validateForm()
    if (!isValid.value) {
      return
    }

    const config = {
      artifactId: form.value.artifactId || undefined,
      id: form.value.name.toLowerCase().replace(/ /g, '-'),
      name: form.value.name,
      description: form.value.description,
      version: form.value.version,
      entityForms: form.value.entityForms,
      externalSync: form.value.externalSync,
      authConfigs: form.value.authConfigs,
    }

    const formData = new FormData()
    formData.append(
      'config',
      new Blob([JSON.stringify(config)], {
        type: 'application/json',
      }),
      'config.json',
    )

    await createAppApi(formData)
    snackBarStore.showSnackbar('Collection program created successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error saving form:', error)
    snackBarStore.showSnackbar('Error creating collection program', 'red')
  }
}

const updateConfig = async () => {
  try {
    isValid.value = validateForm()
    if (!isValid.value) {
      return
    }

    const config = {
      artifactId: form.value.artifactId || undefined,
      id: route.params.id as string,
      name: form.value.name,
      description: form.value.description,
      version: form.value.version,
      entityForms: form.value.entityForms,
      externalSync: form.value.externalSync,
      authConfigs: form.value.authConfigs,
    }

    const formData = new FormData()
    formData.append(
      'config',
      new Blob([JSON.stringify(config)], {
        type: 'application/json',
      }),
      'config.json',
    )

    await updateAppApi(route.params.id as string, formData)
    snackBarStore.showSnackbar('Collection program updated successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error updating config:', error)
    snackBarStore.showSnackbar('Error updating collection program', 'red')
  }
}

const validateForm = () => {
  let isValid = true
  nameError.value = ''
  descriptionError.value = ''
  entityFormsError.value = ''
  itemEntityFormsError.value = {}
  typeError.value = ''
  urlError.value = ''
  versionError.value = ''
  authConfigsError.value = {}

  if (!form.value.name) {
    nameError.value = 'Name is required'
    isValid = false
  }
  if (!form.value.description) {
    descriptionError.value = 'Description is required'
    isValid = false
  }
  if (!form.value.version) {
    versionError.value = 'Version is required'
    isValid = false
  }
  if (form.value.entityForms.length === 0) {
    entityFormsError.value = 'At least one entity form is required'
    isValid = false
  }
  form.value.entityForms.forEach((entityForm) => {
    if (!entityForm.name) {
      set(itemEntityFormsError.value, `${entityForm.name}.name`, 'Name is required')
      isValid = false
    }
    if (!entityForm.title) {
      set(itemEntityFormsError.value, `${entityForm.name}.title`, 'Title is required')
      isValid = false
    }
    if (!entityForm.formio) {
      set(itemEntityFormsError.value, `${entityForm.name}.formio`, 'Form is required')
      isValid = false
    }
  })
  if (!form.value.externalSync.type) {
    typeError.value = 'Type is required'
    isValid = false
  }
  if (!form.value.externalSync.url) {
    urlError.value = 'URL is required'
    isValid = false
  }
  if (form.value.authConfigs?.length > 0) {
    form.value.authConfigs.forEach((authConfig, index) => {
      if (authConfig.type === '') {
        set(authConfigsError.value, `${index}.type`, 'Type is required')
        isValid = false
      }
      if (Object.keys(authConfig.fields).length === 0) {
        set(authConfigsError.value, `${index}.fieldsError`, 'At least one field is required')
        isValid = false
      } else {
        Object.keys(authConfig.fields).forEach((field, fieldIndex) => {
          if (!field) {
            set(authConfigsError.value, `${index}.fields.${fieldIndex}.name`, 'Name is required')
            isValid = false
          }
          if (!authConfig.fields[field]) {
            set(authConfigsError.value, `${index}.fields.${fieldIndex}.value`, 'Value is required')
            isValid = false
          }
        })
      }
    })
  }

  return isValid
}

const addEntityForm = () => {
  entityFormsError.value = ''
  itemEntityFormsError.value = {}
  form.value.entityForms.push({
    name: '',
    title: '',
    dependsOn: '',
    formio: null,
  })
}

const removeEntityForm = (index: number) => {
  form.value.entityForms.splice(index, 1)
}

const buildFormio = (entityForm: EntityForm) => {
  selectedForFormBuilder.value = { name: entityForm.name, title: entityForm.title }
  showBuilder.value = true
}

const editFormio = (entityForm: EntityForm) => {
  selectedForFormBuilder.value = {
    name: entityForm.name,
    title: entityForm.title,
    formio: entityForm.formio as object,
  }
  showBuilder.value = true
}

const saveFormio = (formio: object) => {
  const index = form.value.entityForms.findIndex(
    (entityForm) => entityForm.name === selectedForFormBuilder.value?.name,
  )
  if (index !== -1) {
    form.value.entityForms[index].formio = formio
  }
  selectedForFormBuilder.value = null
}

const addAuthConfig = () => {
  form.value.authConfigs.push({
    type: '',
    fields: {},
  })
}

const removeAuthConfig = (index: number) => {
  form.value.authConfigs.splice(index, 1)
}

const clearEntityFormErrors = () => {
  entityFormsError.value = ''
  itemEntityFormsError.value = {}
  circularDepError.value = false
}

const importSpecFromFile = async (file: File) => {
  try {
    isImportingSpec.value = true
    const yamlText = await file.text()
    const importResult = parseOpenSppProgramSpecification(yamlText)

    if (importResult.name) {
      form.value.name = importResult.name
    }
    if (importResult.description) {
      form.value.description = importResult.description
    }
    if (importResult.artifactId) {
      form.value.artifactId = importResult.artifactId
    }

    form.value.entityForms = importResult.entityForms.map((entityForm) => ({
      name: entityForm.name,
      title: entityForm.title,
      dependsOn: entityForm.dependsOn ?? '',
      formio: entityForm.formio,
    }))

    clearEntityFormErrors()
    activeTab.value = 'form'
    snackBarStore.showSnackbar(
      `Imported ${importResult.entityForms.length} entity form${
        importResult.entityForms.length === 1 ? '' : 's'
      } from OpenSPP spec`,
      'success',
    )
  } catch (error) {
    console.error('Failed to import OpenSPP spec:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    snackBarStore.showSnackbar(`Failed to import OpenSPP spec: ${message}`, 'red')
  } finally {
    specImportFiles.value = null
    isImportingSpec.value = false
  }
}

const onSpecFileSelection = async (value: File[] | File | null) => {
  if (!value || isImportingSpec.value) {
    specImportFiles.value = null
    return
  }
  const file = Array.isArray(value) ? value[0] : value
  if (!file) {
    specImportFiles.value = null
    return
  }
  await importSpecFromFile(file)
}

// JSON Import handlers
const uploadJsonConfig = async () => {
  if (!jsonFile.value) return

  try {
    isUploadingJson.value = true
    const fileReader = new FileReader()
    fileReader.onload = async (event: ProgressEvent<FileReader>) => {
      try {
        const json = JSON.parse(event.target?.result as string)

        if (!json || typeof json !== 'object') {
          throw new Error('Invalid configuration format')
        }

        const existingAppId = json.id
        if (existingAppId) {
          const existingApps = await getAppsApi({ search: existingAppId, pageSize: 1 })
          if (existingApps.data.some((app) => app.id === existingAppId)) {
            jsonFileError.value = `A collection program with ID "${existingAppId}" already exists. Please use a different ID or update the existing program.`
            isUploadingJson.value = false
            return
          }
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
        jsonFile.value = null
        jsonFileError.value = null
        snackBarStore.showSnackbar('Collection program imported successfully', 'success')
        router.push('/')
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) {
          authStore.logout()
          return
        }
        if (error instanceof AxiosError && error.response?.status === 409) {
          jsonFileError.value = 'A collection program with this ID already exists.'
        } else {
          console.error('Error uploading configuration:', error)
          jsonFileError.value =
            error instanceof Error ? error.message : 'Error uploading configuration'
        }
      } finally {
        isUploadingJson.value = false
      }
    }

    fileReader.onerror = () => {
      console.error('Error reading file')
      jsonFileError.value = 'Failed to read the configuration file'
      isUploadingJson.value = false
    }

    fileReader.readAsText(jsonFile.value)
  } catch (error) {
    console.error('Error:', error)
    jsonFileError.value = 'Error uploading configuration'
    isUploadingJson.value = false
  }
}

// OpenSPP Field Mapping handlers
const v1SyncConfig = computed(() => {
  const sync = form.value.externalSync
  const config = (sync?.adapterConfig as Record<string, string | number | boolean> | undefined) || {}
  return {
    url: sync?.url || '',
    database: (config.database as string) || '',
    username: (config.username as string) || '',
    password: (config.password as string) || '',
  }
})

const isV1SyncConfigComplete = computed(() => {
  const { url, database, username, password } = v1SyncConfig.value
  return !!(url && database && username && password)
})

const fetchOpenSppFields = async () => {
  if (!isV1SyncConfigComplete.value) {
    snackBarStore.showSnackbar('Complete the OpenSPP connection settings first', 'warning')
    return
  }
  try {
    isFetchingOpenSppFields.value = true
    const result = await fetchOpenSppFieldsFromAPI({
      url: v1SyncConfig.value.url,
      database: v1SyncConfig.value.database,
      username: v1SyncConfig.value.username,
      password: v1SyncConfig.value.password,
    })
    opensppFields.value = result.fields
    snackBarStore.showSnackbar(`Fetched ${result.fields.length} OpenSPP fields`, 'success')
  } catch (error) {
    snackBarStore.showSnackbar(
      error instanceof Error ? error.message : 'Failed to fetch OpenSPP fields',
      'error',
    )
  } finally {
    isFetchingOpenSppFields.value = false
  }
}

const openFieldMappingForForm = (entityForm: EntityForm) => {
  selectedFormForMapping.value = entityForm
  showFieldMapping.value = true
}

const onFieldMappingsSave = (mappings: FieldMapping[]) => {
  if (!form.value.externalSync) {
    form.value.externalSync = {
      type: undefined,
      url: '',
      extraFields: [],
      adapterConfig: {},
    }
  }
  form.value.externalSync.fieldMappings = mappings
  snackBarStore.showSnackbar(`Saved ${mappings.length} field mappings`, 'success')
}

const getFormFields = (formio: unknown): Array<{ key: string; label: string }> => {
  if (!formio || typeof formio !== 'object') {
    return []
  }

  const formioObj = formio as { components?: unknown[] }
  if (!formioObj.components || !Array.isArray(formioObj.components)) {
    return []
  }

  const fields: Array<{ key: string; label: string }> = []

  const traverse = (components: unknown[]): void => {
    components.forEach((component) => {
      if (!component || typeof component !== 'object') {
        return
      }

      const comp = component as {
        key?: string
        label?: string
        input?: boolean
        type?: string
        components?: unknown[]
        columns?: Array<{ components?: unknown[] }>
        rows?: Array<Array<{ components?: unknown[] }>>
      }

      if (comp.input && comp.key && comp.type !== 'button') {
        fields.push({
          key: comp.key,
          label: comp.label || comp.key,
        })
      }

      if (Array.isArray(comp.components)) {
        traverse(comp.components)
      }
      if (Array.isArray(comp.columns)) {
        comp.columns.forEach((column) => {
          if (Array.isArray(column.components)) {
            traverse(column.components)
          }
        })
      }
      if (Array.isArray(comp.rows)) {
        comp.rows.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (cell?.components && Array.isArray(cell.components)) {
                traverse(cell.components)
              }
            })
          }
        })
      }
    })
  }

  traverse(formioObj.components)
  return fields
}

const isOpenSppSync = () => {
  const type = form.value.externalSync?.type
  return (
    type === 'openspp-adapter' ||
    type === 'openspp-v1-adapter' ||
    type === 'openspp-v2-adapter' ||
    type === 'openspp'
  )
}

const goBack = () => {
  router.push('/')
}
</script>

<template>
  <v-container v-if="isReady" class="config-create" fluid>
    <!-- Header -->
    <div class="subpage-nav">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
        Collection Programs
      </v-btn>
    </div>

    <div class="config-header">
      <h1 class="config-title">{{ pageTitle }}</h1>
      <p class="config-subtitle">
        {{
          isEdit
            ? 'Update your collection program configuration'
            : 'Choose how you want to create your collection program'
        }}
      </p>
    </div>

    <!-- Creation Method Tabs (only show for new programs) -->
    <v-card v-if="!isEdit && !isCopy" class="method-card" border="md" elevation="0">
      <v-tabs v-model="activeTab" color="primary" grow>
        <v-tab value="form">
          <v-icon start icon="mdi-form-select" />
          Create Form
        </v-tab>
        <v-tab value="json">
          <v-icon start icon="mdi-code-json" />
          Import JSON
        </v-tab>
        <v-tab value="yaml">
          <v-icon start icon="mdi-file-code" />
          Import OpenSPP YAML
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <!-- JSON Import Tab -->
        <v-window-item value="json">
          <v-card-text class="pa-6">
            <div class="import-section">
              <v-icon icon="mdi-cloud-upload" size="48" color="primary" class="mb-4" />
              <h3 class="import-title">Import JSON Configuration</h3>
              <p class="import-description">
                Upload an exported JSON configuration file to create a new collection program.
              </p>
              <v-file-input
                v-model="jsonFile"
                class="mt-6"
                accept=".json"
                label="Choose JSON file"
                prepend-icon="mdi-file-document"
                variant="outlined"
                :error-messages="jsonFileError"
                :loading="isUploadingJson"
                :disabled="isUploadingJson"
              />
              <v-btn
                color="primary"
                size="large"
                :loading="isUploadingJson"
                :disabled="!jsonFile || isUploadingJson"
                @click="uploadJsonConfig"
              >
                Import Configuration
              </v-btn>
            </div>
          </v-card-text>
        </v-window-item>

        <!-- YAML Import Tab -->
        <v-window-item value="yaml">
          <v-card-text class="pa-6">
            <div class="import-section">
              <v-icon icon="mdi-file-code" size="48" color="secondary" class="mb-4" />
              <h3 class="import-title">Import OpenSPP YAML Specification</h3>
              <p class="import-description">
                Upload an OpenSPP program specification (YAML) to automatically generate entity
                forms. After import, you can customize the configuration before saving.
              </p>
              <v-file-input
                v-model="specImportFiles"
                class="mt-6"
                accept=".yaml,.yml"
                label="Choose YAML file"
                prepend-icon="mdi-file-upload-outline"
                variant="outlined"
                :loading="isImportingSpec"
                :disabled="isImportingSpec"
                @update:modelValue="onSpecFileSelection"
              />
              <v-alert v-if="isImportingSpec" type="info" variant="tonal" class="mt-4">
                Processing YAML specification...
              </v-alert>
            </div>
          </v-card-text>
        </v-window-item>

        <!-- Form Tab (placeholder to switch to form below) -->
        <v-window-item value="form">
          <v-card-text class="pa-6">
            <p class="text-body-2 text-medium-emphasis">
              Configure your collection program using the form below.
            </p>
          </v-card-text>
        </v-window-item>
      </v-window>
    </v-card>

    <!-- Configuration Form (shown when creating from form or editing) -->
    <v-card
      v-if="activeTab === 'form' || isEdit || isCopy"
      class="config-form-card mt-6"
      border="md"
      elevation="0"
    >
      <!-- Inner tabs for form sections -->
      <v-tabs v-model="configFormTab" color="primary" class="config-form-tabs">
        <v-tab value="basic">Basic Info</v-tab>
        <v-tab value="forms">
          Entity Forms
          <v-chip v-if="form.entityForms.length > 0" size="x-small" class="ml-2">
            {{ form.entityForms.length }}
          </v-chip>
        </v-tab>
        <v-tab value="sync">External Sync</v-tab>
        <v-tab value="auth">Authentication</v-tab>
      </v-tabs>

      <v-window v-model="configFormTab" class="config-form-window">
        <!-- Basic Info Tab -->
        <v-window-item value="basic">
          <v-card-text class="pa-6">
            <v-text-field
              v-model="form.name"
              label="Program Name"
              placeholder="Enter a descriptive name"
              required
              :error-messages="nameError"
              v-trim
              variant="outlined"
            />
            <v-textarea
              v-model="form.description"
              label="Description"
              placeholder="Describe the purpose of this collection program"
              required
              :error-messages="descriptionError"
              v-trim
              variant="outlined"
              rows="3"
            />
            <v-text-field
              v-model="form.version"
              label="Version"
              placeholder="1.0.0"
              required
              :error-messages="versionError"
              v-trim
              variant="outlined"
            />
          </v-card-text>
        </v-window-item>

        <!-- Entity Forms Tab -->
        <v-window-item value="forms">
          <v-card-text class="pa-6">
            <v-alert v-if="entityFormsError" type="error" class="mb-4" variant="tonal">
              {{ entityFormsError }}
            </v-alert>

            <div v-if="form.entityForms.length === 0" class="empty-forms">
              <v-icon icon="mdi-form-select" size="48" color="grey-lighten-1" />
              <p class="mt-4">No entity forms configured yet.</p>
              <v-btn color="primary" class="mt-4" @click="addEntityForm">
                <v-icon start icon="mdi-plus" />
                Add Entity Form
              </v-btn>
            </div>

            <div v-else class="entity-forms-list">
              <v-expansion-panels variant="accordion">
                <v-expansion-panel v-for="(entityForm, index) in form.entityForms" :key="index">
                  <v-expansion-panel-title>
                    <div class="d-flex align-center gap-3">
                      <v-chip size="small" color="primary" variant="tonal">
                        {{ index + 1 }}
                      </v-chip>
                      <span class="font-weight-medium">
                        {{ entityForm.title || entityForm.name || 'Untitled Form' }}
                      </span>
                      <v-chip
                        v-if="entityForm.formio"
                        size="x-small"
                        color="success"
                        variant="flat"
                      >
                        Configured
                      </v-chip>
                    </div>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <v-row dense>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="entityForm.name"
                          label="Entity Name (ID)"
                          required
                          :error-messages="itemEntityFormsError[entityForm.name]?.name"
                          v-trim
                          variant="outlined"
                          density="compact"
                        />
                      </v-col>
                      <v-col cols="12" md="6">
                        <v-text-field
                          v-model="entityForm.title"
                          label="Display Title"
                          required
                          :error-messages="itemEntityFormsError[entityForm.name]?.title"
                          v-trim
                          variant="outlined"
                          density="compact"
                        />
                      </v-col>
                      <v-col v-if="getDependsOnValues(entityForm).length > 0" cols="12">
                        <v-select
                          clearable
                          v-model="entityForm.dependsOn"
                          :items="getDependsOnValues(entityForm)"
                          label="Depends On"
                          :error="circularDepError"
                          :error-messages="circularDepError ? 'Circular dependency detected' : ''"
                          variant="outlined"
                          density="compact"
                        />
                      </v-col>
                    </v-row>

                    <div class="d-flex gap-2 mt-4">
                      <v-btn
                        v-if="!entityForm.formio"
                        color="primary"
                        variant="tonal"
                        @click="buildFormio(entityForm)"
                        :class="{ 'text-error': itemEntityFormsError[entityForm.name]?.formio }"
                      >
                        <v-icon start icon="mdi-form-select" />
                        Build Form
                      </v-btn>
                      <v-btn v-else color="success" variant="tonal" @click="editFormio(entityForm)">
                        <v-icon start icon="mdi-pencil" />
                        Edit Form
                      </v-btn>
                      <v-btn color="error" variant="text" @click="removeEntityForm(index)">
                        <v-icon start icon="mdi-delete" />
                        Remove
                      </v-btn>
                    </div>

                    <p
                      v-if="itemEntityFormsError[entityForm.name]?.formio"
                      class="text-error text-caption mt-2"
                    >
                      {{ itemEntityFormsError[entityForm.name]?.formio }}
                    </p>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>

              <v-btn color="primary" class="mt-4" @click="addEntityForm">
                <v-icon start icon="mdi-plus" />
                Add Another Form
              </v-btn>
            </div>
          </v-card-text>
        </v-window-item>

        <!-- External Sync Tab -->
        <v-window-item value="sync">
          <v-card-text class="pa-6">
            <v-select
              clearable
              v-model="form.externalSync.type"
              :items="[
                { title: 'Mock Registry Server', value: 'mock' },
                { title: 'OpenSPP V1', value: 'openspp-v1-adapter' },
                { title: 'OpenSPP V2', value: 'openspp-v2-adapter' },
                { title: 'OpenFn', value: 'openfn-adapter' },
              ]"
              label="Sync Type"
              required
              :error-messages="typeError"
              variant="outlined"
            />
            <v-text-field
              v-model="form.externalSync.url"
              label="Sync URL"
              required
              :error-messages="urlError"
              v-trim
              variant="outlined"
            />

            <!-- Adapter-specific configuration fields -->
            <AdapterConfigFields
              v-if="form.externalSync.type"
              :adapter-type="form.externalSync.type"
              v-model="form.externalSync.adapterConfig!"
            />

            <!-- Legacy extra fields (for backwards compatibility) -->
            <v-expansion-panels v-if="form.externalSync.extraFields?.length" class="mt-4">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <span class="text-body-2 text-medium-emphasis">
                    Legacy Extra Fields ({{ form.externalSync.extraFields.length }})
                  </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <FieldsInput v-model="form.externalSync.extraFields" :as-array="true" />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <!-- OpenSPP Field Mapping -->
            <div v-if="isOpenSppSync()" class="mt-6">
              <v-divider class="mb-6" />
              <div class="d-flex align-center justify-space-between mb-4">
                <h3 class="text-h6">OpenSPP Field Mapping</h3>
                <v-btn
                  color="primary"
                  variant="outlined"
                  size="small"
                  :loading="isFetchingOpenSppFields"
                  :disabled="!isV1SyncConfigComplete"
                  @click="fetchOpenSppFields"
                >
                  <v-icon start icon="mdi-refresh" />
                  Fetch Fields
                </v-btn>
              </div>

              <v-card variant="outlined" density="compact" class="mb-4" color="grey-lighten-4">
                <v-card-text class="pa-3">
                  <p class="text-caption text-medium-emphasis font-weight-bold text-uppercase mb-2">
                    Fetching from:
                  </p>
                  <div class="d-flex flex-column ga-1">
                    <div class="d-flex align-center ga-2 text-body-2">
                      <span class="text-medium-emphasis" style="min-width: 80px">URL</span>
                      <code class="text-caption">{{ v1SyncConfig.url || '—' }}</code>
                    </div>
                    <div class="d-flex align-center ga-2 text-body-2">
                      <span class="text-medium-emphasis" style="min-width: 80px">Database</span>
                      <code class="text-caption">{{ v1SyncConfig.database || '—' }}</code>
                    </div>
                    <div class="d-flex align-center ga-2 text-body-2">
                      <span class="text-medium-emphasis" style="min-width: 80px">Username</span>
                      <code class="text-caption">{{ v1SyncConfig.username || '—' }}</code>
                    </div>
                  </div>
                  <v-alert
                    v-if="!isV1SyncConfigComplete"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-2"
                  >
                    Complete the URL, database, username and password fields above to enable field fetching.
                  </v-alert>
                </v-card-text>
              </v-card>

              <v-alert
                v-if="isV1SyncConfigComplete && opensppFields.length === 0"
                type="info"
                variant="tonal"
                density="compact"
              >
                Click "Fetch Fields" to load available OpenSPP fields for mapping.
              </v-alert>
              <v-alert v-else-if="opensppFields.length > 0" type="success" variant="tonal" density="compact">
                {{ opensppFields.length }} OpenSPP field{{ opensppFields.length === 1 ? '' : 's' }}
                loaded.
              </v-alert>

              <div
                v-for="(entityForm, formIndex) in form.entityForms"
                :key="formIndex"
                class="mt-4"
              >
                <v-card variant="outlined" class="pa-4">
                  <div class="d-flex align-center justify-space-between">
                    <div>
                      <span class="font-weight-medium">{{
                        entityForm.title || entityForm.name
                      }}</span>
                      <v-chip size="x-small" class="ml-2">
                        {{ getFormFields(entityForm.formio).length }} fields
                      </v-chip>
                    </div>
                    <v-btn
                      v-if="entityForm.formio"
                      color="primary"
                      variant="text"
                      size="small"
                      @click="openFieldMappingForForm(entityForm)"
                    >
                      Map Fields
                    </v-btn>
                  </div>
                  <div v-if="form.externalSync?.fieldMappings?.length" class="mt-3">
                    <v-chip
                      v-for="(mapping, idx) in form.externalSync.fieldMappings"
                      :key="idx"
                      size="small"
                      class="mr-2 mb-2"
                    >
                      {{ mapping.formField }} -> {{ mapping.opensppField }}
                    </v-chip>
                  </div>
                </v-card>
              </div>
            </div>
          </v-card-text>
        </v-window-item>

        <!-- Auth Config Tab -->
        <v-window-item value="auth">
          <v-card-text class="pa-6">
            <div v-if="form.authConfigs.length === 0" class="empty-auth">
              <v-icon icon="mdi-shield-key" size="48" color="grey-lighten-1" />
              <p class="mt-4">No authentication configured. This is optional.</p>
              <v-btn color="primary" variant="tonal" class="mt-4" @click="addAuthConfig">
                <v-icon start icon="mdi-plus" />
                Add Auth Config
              </v-btn>
            </div>

            <div v-else>
              <div
                v-for="(authConfig, index) in form.authConfigs"
                :key="index"
                class="auth-config-item mb-4"
              >
                <v-card variant="outlined" class="pa-4">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <span class="font-weight-medium">Auth Config {{ index + 1 }}</span>
                    <v-btn
                      color="error"
                      variant="text"
                      size="small"
                      icon="mdi-delete"
                      @click="removeAuthConfig(index)"
                    />
                  </div>
                  <v-select
                    v-model="form.authConfigs[index].type"
                    :items="[
                      { title: 'None', value: '' },
                      { title: 'Auth0', value: 'auth0' },
                      { title: 'Keycloak', value: 'keycloak' },
                    ]"
                    label="Type"
                    required
                    :error-messages="authConfigsError[index]?.type"
                    variant="outlined"
                    density="compact"
                  />
                  <FieldsInput
                    v-model="form.authConfigs[index].fields"
                    :error="authConfigsError[index]?.fieldsError"
                  />
                </v-card>
              </div>
              <v-btn color="primary" variant="tonal" @click="addAuthConfig">
                <v-icon start icon="mdi-plus" />
                Add Another
              </v-btn>
            </div>
          </v-card-text>
        </v-window-item>
      </v-window>

      <!-- Actions -->
      <v-divider />
      <v-card-actions class="pa-4">
        <v-btn variant="text" @click="goBack">Cancel</v-btn>
        <v-spacer />
        <v-btn color="primary" size="large" @click="isEdit ? updateConfig() : createConfig()">
          {{ isEdit ? 'Update Program' : 'Create Program' }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Dialogs -->
    <FormBuilderDialog
      v-model="showBuilder"
      :name="selectedForFormBuilder?.name"
      :title="selectedForFormBuilder?.title"
      :formio="selectedForFormBuilder?.formio"
      @submit="saveFormio"
    />

    <FieldMappingDialog
      v-model="showFieldMapping"
      :form-fields="selectedFormForMapping ? getFormFields(selectedFormForMapping.formio) : []"
      :openspp-fields="opensppFields"
      :existing-mappings="form.externalSync?.fieldMappings"
      @save="onFieldMappingsSave"
    />
  </v-container>
</template>

<style scoped>
.config-create {
  max-width: 900px;
  padding-bottom: var(--spacing-2xl);
}

.config-header {
  margin-bottom: var(--spacing-lg);
}

.config-title {
  font-size: var(--font-size-3xl);
  font-weight: 600;
  margin: 0 0 var(--spacing-sm);
  color: var(--text-main);
}

.config-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-muted);
  margin: 0;
}

.method-card {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.import-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-lg) 0;
  max-width: 500px;
  margin: 0 auto;
}

.import-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0 0 var(--spacing-sm);
  color: var(--text-main);
}

.import-description {
  font-size: var(--font-size-base);
  color: var(--text-muted);
  margin: 0;
}

.config-form-card {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.config-form-tabs {
  border-bottom: 1px solid var(--border-light);
}

.config-form-window {
  min-height: 400px;
}

.empty-forms,
.empty-auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  color: var(--text-muted);
}

.entity-forms-list {
  display: flex;
  flex-direction: column;
}

.auth-config-item {
  margin-bottom: var(--spacing-md);
}
</style>
