/*
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
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { getApp, createApp as createAppApi, updateApp as updateAppApi, type FieldMapping } from '@/api'
import type { ExternalSyncField } from '@idpass/data-collect-core'

// Types
export interface EntityForm {
  name: string
  title: string
  dependsOn: string
  formio: unknown
}

export interface ExternalSync {
  type?: string
  url: string
  /** @deprecated Use adapterConfig instead */
  extraFields: ExternalSyncField[]
  /** Typed adapter configuration */
  adapterConfig?: Record<string, string | number | boolean>
  fieldMappings?: FieldMapping[]
}

export interface AuthConfig {
  type: string
  fields: Record<string, string>
}

export interface ProgramDraft {
  artifactId?: string
  name: string
  description: string
  version: string
  entityForms: EntityForm[]
  externalSync: ExternalSync
  authConfigs: AuthConfig[]
}

export interface StepValidation {
  general: boolean
  forms: boolean
  sync: boolean
  auth: boolean
}

export interface StepErrors {
  general: {
    name?: string
    description?: string
    version?: string
  }
  forms: {
    global?: string
    items: Record<string, { name?: string; title?: string; formio?: string }>
    circularDep?: boolean
  }
  sync: {
    type?: string
    url?: string
  }
  auth: Record<string, { type?: string; fieldsError?: string; fields?: Record<string, string> }>
}

const STORAGE_KEY = 'program-draft'
const DRAFT_META_KEY = 'program-draft-meta'

interface DraftMeta {
  id: string | null
  mode: 'create' | 'edit' | 'copy'
  lastSaved: string
}

const getEmptyDraft = (): ProgramDraft => ({
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

const getEmptyErrors = (): StepErrors => ({
  general: {},
  forms: { items: {} },
  sync: {},
  auth: {},
})

export const useProgramDraftStore = defineStore('programDraft', () => {
  // State
  const draft = ref<ProgramDraft>(getEmptyDraft())
  const errors = ref<StepErrors>(getEmptyErrors())
  const isLoading = ref(false)
  const isSaving = ref(false)
  const isDirty = ref(false)
  const lastSavedAt = ref<Date | null>(null)
  const mode = ref<'create' | 'edit' | 'copy'>('create')
  const editingId = ref<string | null>(null)

  // Computed
  const stepValidation = computed<StepValidation>(() => ({
    general: !errors.value.general.name && !errors.value.general.description && !errors.value.general.version,
    forms: !errors.value.forms.global && Object.keys(errors.value.forms.items).length === 0 && !errors.value.forms.circularDep,
    sync: !errors.value.sync.type && !errors.value.sync.url,
    auth: Object.keys(errors.value.auth).length === 0,
  }))

  const isValid = computed(() => {
    return stepValidation.value.general && stepValidation.value.forms && stepValidation.value.sync && stepValidation.value.auth
  })

  const hasRecoverableDraft = computed(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return !!stored
    } catch {
      return false
    }
  })

  // Watchers for auto-save
  watch(
    draft,
    () => {
      isDirty.value = true
      saveDraftToStorage()
    },
    { deep: true }
  )

  // Actions
  const saveDraftToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft.value))
      const meta: DraftMeta = {
        id: editingId.value,
        mode: mode.value,
        lastSaved: new Date().toISOString(),
      }
      localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta))
      lastSavedAt.value = new Date()
    } catch (e) {
      console.error('Failed to save draft to localStorage:', e)
    }
  }

  const loadDraftFromStorage = (): boolean => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const metaStored = localStorage.getItem(DRAFT_META_KEY)
      if (stored && metaStored) {
        draft.value = JSON.parse(stored)
        const meta: DraftMeta = JSON.parse(metaStored)
        editingId.value = meta.id
        mode.value = meta.mode
        lastSavedAt.value = new Date(meta.lastSaved)
        isDirty.value = false
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to load draft from localStorage:', e)
      return false
    }
  }

  const clearDraftFromStorage = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(DRAFT_META_KEY)
    } catch (e) {
      console.error('Failed to clear draft from localStorage:', e)
    }
  }

  const initNewDraft = () => {
    draft.value = getEmptyDraft()
    errors.value = getEmptyErrors()
    mode.value = 'create'
    editingId.value = null
    isDirty.value = false
    lastSavedAt.value = null
    clearDraftFromStorage()
  }

  const initEditDraft = async (id: string) => {
    isLoading.value = true
    try {
      const config = await getApp(id)
      draft.value = {
        artifactId: config.artifactId,
        name: config.name || '',
        description: config.description || '',
        version: config.version || '1',
        entityForms: config.entityForms || [],
        externalSync: {
          type: config.externalSync?.type,
          url: config.externalSync?.url || '',
          extraFields: config.externalSync?.extraFields || [],
          adapterConfig: config.externalSync?.adapterConfig || {},
          fieldMappings: config.externalSync?.fieldMappings || [],
        },
        authConfigs: config.authConfigs || [],
      }
      errors.value = getEmptyErrors()
      mode.value = 'edit'
      editingId.value = id
      isDirty.value = false
      saveDraftToStorage()
    } finally {
      isLoading.value = false
    }
  }

  const initCopyDraft = async (id: string) => {
    isLoading.value = true
    try {
      const config = await getApp(id)
      draft.value = {
        artifactId: undefined,
        name: (config.name || '') + ' Copy',
        description: config.description || '',
        version: config.version || '1',
        entityForms: config.entityForms || [],
        externalSync: {
          type: config.externalSync?.type,
          url: config.externalSync?.url || '',
          extraFields: config.externalSync?.extraFields || [],
          adapterConfig: config.externalSync?.adapterConfig || {},
          fieldMappings: config.externalSync?.fieldMappings || [],
        },
        authConfigs: config.authConfigs || [],
      }
      errors.value = getEmptyErrors()
      mode.value = 'copy'
      editingId.value = null
      isDirty.value = false
      saveDraftToStorage()
    } finally {
      isLoading.value = false
    }
  }

  // Validation
  const validateGeneral = (): boolean => {
    errors.value.general = {}
    let valid = true

    if (!draft.value.name.trim()) {
      errors.value.general.name = 'Name is required'
      valid = false
    }
    if (!draft.value.description.trim()) {
      errors.value.general.description = 'Description is required'
      valid = false
    }
    if (!draft.value.version.trim()) {
      errors.value.general.version = 'Version is required'
      valid = false
    }

    return valid
  }

  const validateForms = (): boolean => {
    errors.value.forms = { items: {} }
    let valid = true

    if (draft.value.entityForms.length === 0) {
      errors.value.forms.global = 'At least one entity form is required'
      valid = false
    }

    draft.value.entityForms.forEach((form) => {
      const formErrors: { name?: string; title?: string; formio?: string } = {}
      if (!form.name.trim()) {
        formErrors.name = 'Name is required'
        valid = false
      }
      if (!form.title.trim()) {
        formErrors.title = 'Title is required'
        valid = false
      }
      if (!form.formio) {
        formErrors.formio = 'Form definition is required'
        valid = false
      }
      if (Object.keys(formErrors).length > 0) {
        errors.value.forms.items[form.name || `form-${draft.value.entityForms.indexOf(form)}`] = formErrors
      }
    })

    // Check for circular dependencies
    const hasCircular = checkCircularDependencies()
    if (hasCircular) {
      errors.value.forms.circularDep = true
      valid = false
    }

    return valid
  }

  const checkCircularDependencies = (): boolean => {
    const dependencyMap = new Map<string, string>()
    draft.value.entityForms.forEach((form) => {
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
        return true
      }
    }

    return false
  }

  const validateSync = (): boolean => {
    errors.value.sync = {}
    let valid = true

    if (!draft.value.externalSync.type) {
      errors.value.sync.type = 'Sync type is required'
      valid = false
    }
    if (!draft.value.externalSync.url.trim()) {
      errors.value.sync.url = 'Sync URL is required'
      valid = false
    }

    return valid
  }

  const validateAuth = (): boolean => {
    errors.value.auth = {}
    let valid = true

    draft.value.authConfigs.forEach((authConfig, index) => {
      const configErrors: { type?: string; fieldsError?: string; fields?: Record<string, string> } = {}

      if (authConfig.type === '') {
        configErrors.type = 'Type is required'
        valid = false
      }
      if (Object.keys(authConfig.fields).length === 0) {
        configErrors.fieldsError = 'At least one field is required'
        valid = false
      } else {
        const fieldErrors: Record<string, string> = {}
        Object.entries(authConfig.fields).forEach(([key, value]) => {
          if (!key.trim()) {
            fieldErrors[key] = 'Field name is required'
            valid = false
          }
          if (!value.trim()) {
            fieldErrors[key] = 'Field value is required'
            valid = false
          }
        })
        if (Object.keys(fieldErrors).length > 0) {
          configErrors.fields = fieldErrors
        }
      }

      if (Object.keys(configErrors).length > 0) {
        errors.value.auth[index] = configErrors
      }
    })

    return valid
  }

  const validateAll = (): boolean => {
    const generalValid = validateGeneral()
    const formsValid = validateForms()
    const syncValid = validateSync()
    const authValid = validateAuth()
    return generalValid && formsValid && syncValid && authValid
  }

  // Entity Form Actions
  const addEntityForm = () => {
    draft.value.entityForms.push({
      name: '',
      title: '',
      dependsOn: '',
      formio: null,
    })
  }

  const removeEntityForm = (index: number) => {
    draft.value.entityForms.splice(index, 1)
  }

  const updateEntityForm = (index: number, updates: Partial<EntityForm>) => {
    if (draft.value.entityForms[index]) {
      Object.assign(draft.value.entityForms[index], updates)
    }
  }

  const getDependsOnOptions = (currentForm: EntityForm) => {
    return draft.value.entityForms
      .filter(
        (form) =>
          form.name !== currentForm.name &&
          form.name !== '' &&
          form.title !== '' &&
          form.dependsOn !== currentForm.name
      )
      .map((form) => ({ name: form.name, title: form.title }))
  }

  // Auth Config Actions
  const addAuthConfig = () => {
    draft.value.authConfigs.push({
      type: '',
      fields: {},
    })
  }

  const removeAuthConfig = (index: number) => {
    draft.value.authConfigs.splice(index, 1)
  }

  // Submit
  const submit = async (): Promise<boolean> => {
    if (!validateAll()) {
      return false
    }

    isSaving.value = true
    try {
      const config = {
        artifactId: draft.value.artifactId || undefined,
        id: mode.value === 'edit' && editingId.value ? editingId.value : draft.value.name.toLowerCase().replace(/ /g, '-'),
        name: draft.value.name,
        description: draft.value.description,
        version: draft.value.version,
        entityForms: draft.value.entityForms,
        externalSync: draft.value.externalSync,
        authConfigs: draft.value.authConfigs,
      }

      const formData = new FormData()
      formData.append(
        'config',
        new Blob([JSON.stringify(config)], { type: 'application/json' }),
        'config.json'
      )

      if (mode.value === 'edit' && editingId.value) {
        await updateAppApi(editingId.value, formData)
      } else {
        await createAppApi(formData)
      }

      clearDraftFromStorage()
      isDirty.value = false
      return true
    } finally {
      isSaving.value = false
    }
  }

  // Import from OpenSPP YAML
  const importFromOpenSppSpec = (importResult: {
    name?: string
    description?: string
    artifactId?: string
    entityForms: Array<{
      name: string
      title: string
      dependsOn?: string
      formio: unknown
    }>
  }) => {
    if (importResult.name) {
      draft.value.name = importResult.name
    }
    if (importResult.description) {
      draft.value.description = importResult.description
    }
    if (importResult.artifactId) {
      draft.value.artifactId = importResult.artifactId
    }
    draft.value.entityForms = importResult.entityForms.map((form) => ({
      name: form.name,
      title: form.title,
      dependsOn: form.dependsOn ?? '',
      formio: form.formio,
    }))
    errors.value.forms = { items: {} }
  }

  return {
    // State
    draft,
    errors,
    isLoading,
    isSaving,
    isDirty,
    lastSavedAt,
    mode,
    editingId,

    // Computed
    stepValidation,
    isValid,
    hasRecoverableDraft,

    // Actions
    initNewDraft,
    initEditDraft,
    initCopyDraft,
    loadDraftFromStorage,
    clearDraftFromStorage,
    saveDraftToStorage,

    // Validation
    validateGeneral,
    validateForms,
    validateSync,
    validateAuth,
    validateAll,

    // Entity Form Actions
    addEntityForm,
    removeEntityForm,
    updateEntityForm,
    getDependsOnOptions,
    checkCircularDependencies,

    // Auth Config Actions
    addAuthConfig,
    removeAuthConfig,

    // Submit
    submit,

    // Import
    importFromOpenSppSpec,
  }
})
