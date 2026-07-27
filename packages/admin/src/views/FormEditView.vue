<!--
  Licensed to the Association pour la cooperation numerique (ACN) under one
  or more contributor license agreements. See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership. The ACN licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License. You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getApp, updateApp } from '@/api'
import { useSnackBarStore } from '@/stores/snackBar'
import FormioBuilder from '@/components/FormioBuilder.vue'

// Standalone single-form editor (#17). Opens the Form.io designer for ONE
// form reached directly from the program detail page — no wizard, no draft
// store. On save it re-loads the full config, splices in just this form's
// edited schema, and PUTs the whole config back (the backend only accepts a
// full config.json). The wizard flow is untouched.

interface EntityForm {
  id?: string
  name: string
  title: string
  dependsOn?: string
  entityType?: 'group' | 'individual' | 'record'
  nameField?: string
  formio?: Record<string, unknown>
  version?: string
  [key: string]: unknown
}

interface AppConfig {
  id: string
  name: string
  entityForms?: EntityForm[]
  [key: string]: unknown
}

const route = useRoute()
const router = useRouter()
const snackBarStore = useSnackBarStore()

const configId = computed(() => route.params.id as string)
const formIndex = computed(() => Number.parseInt(route.params.formIndex as string, 10))

const config = ref<AppConfig | null>(null)
const schema = ref<object>({})
const isLoading = ref(true)
const isSaving = ref(false)
const error = ref<string | null>(null)

const currentForm = computed<EntityForm | null>(() => {
  if (!config.value?.entityForms) return null
  return config.value.entityForms[formIndex.value] ?? null
})

const formTitle = computed(() => currentForm.value?.title || currentForm.value?.name || 'Form')

const goBack = () => {
  router.push({ name: 'app-details', params: { id: configId.value } })
}

onMounted(async () => {
  isLoading.value = true
  error.value = null
  try {
    const loaded = (await getApp(configId.value)) as AppConfig
    config.value = loaded
    const forms = loaded.entityForms ?? []
    if (Number.isNaN(formIndex.value) || formIndex.value < 0 || formIndex.value >= forms.length) {
      error.value = 'The requested form could not be found.'
      return
    }
    const formio = forms[formIndex.value]?.formio
    schema.value = formio ? JSON.parse(JSON.stringify(formio)) : {}
  } catch {
    error.value = 'Failed to load the collection program configuration.'
  } finally {
    isLoading.value = false
  }
})

const save = async () => {
  if (!config.value?.entityForms) return
  isSaving.value = true
  try {
    // Splice the edited schema into just this form, mirroring the wizard's
    // serialization: re-add `id: form.name` and strip the store-only
    // `nameField` when empty so the payload matches AppConfigSchema.
    const entityForms = config.value.entityForms.map((form, index) => {
      const { nameField, ...rest } = form
      const formio = index === formIndex.value ? schema.value : form.formio
      const withId = { ...rest, id: form.name, formio }
      return nameField ? { ...withId, nameField } : withId
    })

    const nextConfig = {
      ...config.value,
      entityForms,
    }

    const formData = new FormData()
    formData.append(
      'config',
      new Blob([JSON.stringify(nextConfig)], { type: 'application/json' }),
      'config.json',
    )

    await updateApp(configId.value, formData)
    snackBarStore.showSnackbar('Form saved', 'success')
    goBack()
  } catch {
    snackBarStore.showSnackbar('Failed to save the form', 'error')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="form-edit-view">
    <div class="form-edit-view__topbar">
      <div class="form-edit-view__title">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" aria-label="Back" @click="goBack" />
        <h2 class="text-h6">Edit form: {{ formTitle }}</h2>
      </div>
      <div class="form-edit-view__actions">
        <v-btn variant="text" :disabled="isSaving" @click="goBack">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          :loading="isSaving"
          :disabled="isLoading || !!error"
          @click="save"
        >
          Save
        </v-btn>
      </div>
    </div>

    <div v-if="isLoading" class="form-edit-view__state">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert v-else-if="error" type="error" variant="tonal" class="ma-4">
      {{ error }}
    </v-alert>

    <div v-else class="form-edit-view__builder">
      <FormioBuilder v-model="schema" class="form-edit-view__builder-host" />
    </div>
  </div>
</template>

<style scoped>
.form-edit-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
}

.form-edit-view__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.form-edit-view__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.form-edit-view__title h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-edit-view__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-edit-view__state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem;
}

.form-edit-view__builder {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.form-edit-view__builder-host {
  flex: 1;
  width: 100%;
  height: 100%;
}
</style>
