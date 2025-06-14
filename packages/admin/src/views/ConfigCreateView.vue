<script setup lang="ts">
import FormBuilderDialog from '@/components/FormBuilderDialog.vue'
import { onMounted, ref, watch } from 'vue'
import set from 'lodash/set'
import { createApp as createAppApi, getApp, updateApp as updateAppApi } from '@/api'
import { useSnackBarStore } from '@/stores/snackBar'
import { useRouter, useRoute } from 'vue-router'

type EntityForm = {
  name: string
  title: string
  dependsOn: string
  formio: unknown
}
type ExternalSync = {
  type?: string
  auth?: string
  url: string
  extraFields: { name: string; value: string }[]
}

type ConfigSchema = {
  name: string
  description: string
  version: string
  entityForms: EntityForm[]
  externalSync: ExternalSync
}

const snackBarStore = useSnackBarStore()
const router = useRouter()
const route = useRoute()
const isEdit = ref(false)
const showBuilder = ref(false)
const form = ref<ConfigSchema>({
  name: '',
  description: '',
  version: '1',
  entityForms: [],
  externalSync: {
    type: undefined,
    url: '',
    auth: '',
    extraFields: [],
  },
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

onMounted(async () => {
  const id = route.params.id
  isEdit.value = route.name?.toString().includes('edit') || false
  if (id) {
    const config = await getApp(id as string)
    form.value = config
    if (route.name?.toString().includes('copy')) {
      form.value.name = config.name + ' Copy'
    }
  }
})

// watch form.entityForms for circular dependencies
watch(
  () => form.value.entityForms,
  (newVal) => {
    // Create a map of dependencies
    const dependencyMap = new Map<string, string>()
    newVal.forEach((form) => {
      if (form.name && form.dependsOn) {
        dependencyMap.set(form.name, form.dependsOn)
      }
    })

    // Check for circular dependencies using DFS
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

    // Check each node for cycles
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
    // remove value if the current entity form is the parent of the value
    .filter((entityForm) => entityForm.dependsOn !== currentEntityForm.name)
    .map((entityForm) => ({ name: entityForm.name, title: entityForm.title }))
  return values
}

const createConfig = async () => {
  console.log('createConfig', form.value)
  try {
    const isValid = validateForm()
    if (!isValid) {
      return
    }

    const config = {
      id: form.value.name.toLowerCase().replace(/ /g, '-'),
      name: form.value.name,
      description: form.value.description,
      version: form.value.version,
      entityForms: form.value.entityForms,
      externalSync: form.value.externalSync,
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
    snackBarStore.showSnackbar('Config created successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error saving form:', error)
    snackBarStore.showSnackbar('Error creating config', 'red')
  }
}

const validateForm = () => {
  let isValid = true
  // reset errors
  nameError.value = ''
  descriptionError.value = ''
  entityFormsError.value = ''
  itemEntityFormsError.value = {}
  typeError.value = ''
  urlError.value = ''
  versionError.value = ''

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
  return isValid
}

const addEntityForm = () => {
  form.value.entityForms.push({
    name: '',
    title: '',
    dependsOn: '',
    formio: null,
  })
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
  console.log('saveFormio', formio)
  const index = form.value.entityForms.findIndex(
    (entityForm) => entityForm.name === selectedForFormBuilder.value?.name,
  )
  if (index !== -1) {
    form.value.entityForms[index].formio = formio
  }
  selectedForFormBuilder.value = null
}

const addExternalSyncField = () => {
  form.value.externalSync.extraFields.push({
    name: '',
    value: '',
  })
}

const removeExternalSyncField = (index: number) => {
  form.value.externalSync.extraFields.splice(index, 1)
}

const updateConfig = async () => {
  try {
    const isValid = validateForm()
    if (!isValid) {
      return
    }

    const config = {
      id: route.params.id as string,
      name: form.value.name,
      description: form.value.description,
      version: form.value.version,
      entityForms: form.value.entityForms,
      externalSync: form.value.externalSync,
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
    snackBarStore.showSnackbar('Config updated successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error updating config:', error)
    snackBarStore.showSnackbar('Error updating config', 'red')
  }
}
</script>

<template>
  <div class="bootstrapWrapper">
    <v-container>
      <v-row>
        <v-col cols="12">
          <h2 class="text-h4 mb-4">{{ isEdit ? 'Edit' : 'Create' }} Config</h2>
          <v-form ref="formRef" @submit.prevent="createConfig">
            <v-text-field
              v-model="form.name"
              label="Name"
              required
              :error-messages="nameError"
            ></v-text-field>
            <v-text-field
              v-model="form.description"
              label="Description"
              required
              :error-messages="descriptionError"
            ></v-text-field>

            <!-- VERSION -->
            <v-text-field
              v-model="form.version"
              label="Version"
              required
              :error-messages="versionError"
            ></v-text-field>

            <!-- ENTITY FORM -->
            <v-divider class="my-6"></v-divider>
            <h2 class="text-h5 mb-4">Entity Forms</h2>
            <v-alert v-if="entityFormsError" type="error" class="mb-4">
              {{ entityFormsError }}
            </v-alert>

            <!-- Add Entity Form -->
            <div v-for="(entityForm, index) in form.entityForms" :key="index" class="mt-4">
              <h1 class="text-h6">Form {{ index + 1 }}</h1>
              <v-text-field
                v-model="entityForm.name"
                label="Name"
                required
                :error-messages="itemEntityFormsError[entityForm.name]?.name"
              ></v-text-field>
              <v-text-field
                v-model="entityForm.title"
                label="Title"
                required
                :error-messages="itemEntityFormsError[entityForm.name]?.title"
              ></v-text-field>
              <v-select
                v-if="getDependsOnValues(entityForm).length > 0"
                clearable
                required
                v-model="entityForm.dependsOn"
                :items="getDependsOnValues(entityForm)"
                label="Depends On"
                :error="circularDepError"
                :error-messages="
                  circularDepError
                    ? 'Circular dependency error. Please check the dependencies.'
                    : ''
                "
              ></v-select>
              <v-btn
                v-if="!entityForm.formio"
                class="mt-2"
                prepend-icon="mdi-file-document-outline"
                size="small"
                variant="outlined"
                @click="buildFormio(entityForm)"
                :color="itemEntityFormsError[entityForm.name]?.formio ? 'error' : 'primary'"
                >Build Form</v-btn
              >

              <!-- edit formio -->
              <v-btn
                v-if="entityForm.formio"
                color="success"
                size="small"
                variant="outlined"
                @click="editFormio(entityForm)"
                >Edit Form</v-btn
              >
              <br />
              <span v-if="itemEntityFormsError[entityForm.name]?.formio" class="text-error">
                {{ itemEntityFormsError[entityForm.name]?.formio }}
              </span>
            </div>

            <v-btn color="primary" @click="addEntityForm" class="mt-4">Add Entity Form</v-btn>

            <!-- EXTERNAL SYNC -->
            <v-divider class="my-6"></v-divider>
            <h2 class="text-h5 mb-4">External Sync</h2>
            <v-select
              clearable
              v-model="form.externalSync.type"
              :items="[
                { title: 'Mock Sync Server', value: 'mock-sync-server' },
                { title: 'OpenSPP', value: 'openspp-adapter' },
                { title: 'OpenFn', value: 'openfn-adapter' },
              ]"
              label="Type"
              title="The type of external sync to use"
              required
              :error-messages="typeError"
            ></v-select>
            <!-- url -->
            <v-text-field
              v-model="form.externalSync.url"
              label="URL"
              required
              :error-messages="urlError"
            ></v-text-field>
            <!-- select auth type -->
            <v-select
              v-model="form.externalSync.auth"
              :items="[
                { title: 'None', value: '' },
                { title: 'Basic', value: 'basic' },
              ]"
              label="Auth"
              required
            ></v-select>
            <!-- button to add more fields -->
            <v-btn @click="addExternalSyncField" class="mb-4 mt-4">Add Field</v-btn>
            <div v-for="(field, index) in form.externalSync.extraFields" :key="index">
              <v-row>
                <v-col cols="5">
                  <v-text-field v-model="field.name" label="Name" required></v-text-field>
                </v-col>
                <v-col cols="5">
                  <v-text-field v-model="field.value" label="Value" required></v-text-field>
                </v-col>
                <v-col cols="1" class="mt-2">
                  <v-btn
                    color="error"
                    icon="mdi-trash-can-outline"
                    @click="removeExternalSyncField(index)"
                  ></v-btn>
                </v-col>
              </v-row>
            </div>

            <v-card-actions class="mt-4">
              <v-spacer></v-spacer>
              <v-btn
                variant="elevated"
                color="success"
                @click="isEdit ? updateConfig() : createConfig()"
                >{{ isEdit ? 'Update Config' : 'Create Config' }}
              </v-btn>
            </v-card-actions>
          </v-form>
        </v-col>
      </v-row>
    </v-container>

    <FormBuilderDialog
      v-model="showBuilder"
      :name="selectedForFormBuilder?.name"
      :title="selectedForFormBuilder?.title"
      :formio="selectedForFormBuilder?.formio"
      @submit="saveFormio"
    />
  </div>
</template>

<style scoped></style>
