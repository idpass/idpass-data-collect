<script setup lang="ts">
import { createApp as createAppApi, getApp, updateApp as updateAppApi } from '@/api'
import FormBuilderDialog from '@/components/FormBuilderDialog.vue'
import FieldsInput from '@/components/FieldsInput.vue'
import { useSnackBarStore } from '@/stores/snackBar'
import set from 'lodash/set'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import merge from 'lodash/merge'

type EntityForm = {
  name: string
  title: string
  selfServiceUser: boolean
  dependsOn: string
  formio: unknown
}
type ExternalSync = {
  type?: string
  url: string
  extraFields: Record<string, string>
}

type AuthConfig = {
  type: string
  fields: Record<string, string>
}

type ConfigSchema = {
  name: string
  description: string
  version: string
  entityForms: EntityForm[]
  externalSync: ExternalSync
  authConfigs: AuthConfig[]
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
    extraFields: {},
  },
  authConfigs: [],
})
const circularDepError = ref(false)
const selectedForFormBuilder = ref<{ name: string; title: string; formio?: object } | null>(null)
const nameError = ref('')
const descriptionError = ref('')
const entityFormsError = ref('')
const itemEntityFormsError = ref<{
  [key: string]: { name: string; title: string; formio: string; selfServiceUser: string }
}>({})
const typeError = ref('')
const urlError = ref('')
const versionError = ref('')
const authConfigsError = ref<{
  [key: string]: { type: string; fieldsError: string; fields: Record<string, string> }
}>({})
const isValid = ref(false)
const isReady = ref(false)

onMounted(async () => {
  const id = route.params.id
  isEdit.value = route.name?.toString().includes('edit') || false
  if (id) {
    const config = await getApp(id as string)
    form.value = merge(form.value, config)
    if (route.name?.toString().includes('copy')) {
      form.value.name = config.name + ' Copy'
    }
  }
  isReady.value = true
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
  try {
    isValid.value = validateForm()
    if (!isValid.value) {
      return
    }

    const config = {
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
    snackBarStore.showSnackbar('Config created successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error saving form:', error)
    snackBarStore.showSnackbar('Error creating config', 'red')
  }
}

const updateConfig = async () => {
  try {
    isValid.value = validateForm()
    if (!isValid.value) {
      return
    }

    const config = {
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
    snackBarStore.showSnackbar('Config updated successfully', 'success')
    router.push('/')
  } catch (error) {
    console.error('Error updating config:', error)
    snackBarStore.showSnackbar('Error updating config', 'red')
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
  // if at least one auth config is added, then at least one field is required
  if (form.value.authConfigs.length > 0) {
    console.log(form.value.authConfigs)
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
    selfServiceUser: false,
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
</script>

<template>
  <div v-if="isReady" class="bootstrapWrapper">
    <v-container>
      <v-row>
        <v-col cols="12">
          <h2 class="text-h4 mb-4">{{ isEdit ? 'Edit' : 'Create' }} Config</h2>
          <v-form>
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
              <h1 class="text-h6 ml-2">Form {{ index + 1 }}</h1>
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
              <v-checkbox
                v-model="entityForm.selfServiceUser"
                label="Self Service User"
                hint="If checked, this entity will be used for self service user creation"
                :error-messages="itemEntityFormsError[entityForm.name]?.selfServiceUser"
              ></v-checkbox>
              <v-btn
                v-if="!entityForm.formio"
                class="mt-4"
                prepend-icon="mdi-file-document-outline"
                size="small"
                @click="buildFormio(entityForm)"
                :color="itemEntityFormsError[entityForm.name]?.formio ? 'error' : 'inherit'"
                >Build Form</v-btn
              >

              <!-- edit formio -->
              <v-btn
                v-if="entityForm.formio"
                color="success"
                size="small"
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
            <v-text-field
              v-model="form.externalSync.url"
              label="URL"
              required
              :error-messages="urlError"
            ></v-text-field>
            <FieldsInput v-model="form.externalSync.extraFields" />

            <!-- AUTH CONFIG -->
            <v-divider class="my-6"></v-divider>
            <h2 class="text-h5 mb-4">Auth Config</h2>

            <div v-for="(_, index) in form.authConfigs" :key="index">
              <v-row align="center" class="mb-0">
                <v-col cols="6">
                  <h2 class="text-h6 ml-2">Config {{ index + 1 }}</h2>
                </v-col>
                <v-col cols="6" class="text-right">
                  <v-btn
                    color="error"
                    size="small"
                    icon="mdi-trash-can-outline"
                    @click="removeAuthConfig(index)"
                  ></v-btn>
                </v-col>
              </v-row>

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
              ></v-select>
              <FieldsInput
                v-model="form.authConfigs[index].fields"
                :error="authConfigsError[index]?.fieldsError"
              />
            </div>
            <v-btn color="primary" @click="addAuthConfig" class="mb-4 mt-4">Add Auth Config</v-btn>

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
