<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import AdapterConfigFields from '@/components/AdapterConfigFields.vue'
import FieldsInput from '@/components/FieldsInput.vue'
import OpenSppFieldInputDialog from '@/components/OpenSppFieldInputDialog.vue'
import type { ParsedOpenSppField } from '@/api'
import { useSnackBarStore } from '@/stores/snackBar'

const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const showOpenSppFieldInput = ref(false)
const opensppFields = ref<ParsedOpenSppField[]>([])

const syncTypeOptions = [
  ...(import.meta.env.DEV ? [{ title: 'Mock Sync Server', value: 'mock-sync-server' }] : []),
  { title: 'OpenSPP v1', value: 'openspp-v1-adapter' },
  { title: 'OpenSPP v2', value: 'openspp-v2-adapter' },
  { title: 'OpenFn', value: 'openfn-adapter' },
]

const isOpenSppSync = computed(() => {
  const type = draftStore.draft.externalSync?.type
  return (
    type === 'openspp-adapter' ||
    type === 'openspp-v1-adapter' ||
    type === 'openspp-v2-adapter' ||
    type === 'openspp'
  )
})

const hasEntityForms = computed(() => draftStore.draft.entityForms.length > 0)

const onOpenSppFieldsParsed = (fields: ParsedOpenSppField[]) => {
  opensppFields.value = fields
  snackBarStore.showSnackbar(`Loaded ${fields.length} OpenSPP fields`, 'success')
}

const goToFieldMapping = () => {
  router.push({ name: 'wizard-mapping' })
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
</script>

<template>
  <div class="sync-step">
    <p class="step-description">
      Configure how your collection program synchronizes data with external systems. Choose a sync
      adapter and provide the necessary connection details.
    </p>

    <v-form class="sync-form">
      <!-- Sync Type -->
      <div class="form-section">
        <label class="form-label">
          Sync Type
          <span class="required">*</span>
        </label>
        <v-select
          v-model="draftStore.draft.externalSync.type"
          :items="syncTypeOptions"
          placeholder="Select a sync adapter"
          :error-messages="draftStore.errors.sync.type"
          variant="outlined"
          density="comfortable"
          clearable
        />
        <p class="form-hint">
          Choose the external system you want to sync data with.
        </p>
      </div>

      <!-- Sync URL -->
      <div class="form-section">
        <label class="form-label">
          Sync URL
          <span class="required">*</span>
        </label>
        <v-text-field
          v-model="draftStore.draft.externalSync.url"
          placeholder="https://api.example.com/sync"
          :error-messages="draftStore.errors.sync.url"
          variant="outlined"
          density="comfortable"
        />
        <p class="form-hint">
          The base URL of the external sync endpoint.
        </p>
      </div>

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

      <!-- OpenSPP Field Mapping Section -->
      <div v-if="isOpenSppSync" class="form-section openspp-mapping">
        <v-divider class="mb-6" />
        <div class="section-header">
          <div>
            <label class="form-label">OpenSPP Field Mapping</label>
            <p class="form-hint">
              Map form fields to OpenSPP fields for proper data synchronization.
            </p>
          </div>
          <v-btn
            color="primary"
            variant="outlined"
            size="small"
            @click="showOpenSppFieldInput = true"
          >
            <v-icon start icon="mdi-upload" />
            Import Fields
          </v-btn>
        </div>

        <v-alert
          v-if="opensppFields.length === 0"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          Import OpenSPP fields from a sample payload to enable field mapping.
        </v-alert>

        <v-alert
          v-else
          type="success"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          {{ opensppFields.length }} OpenSPP field{{ opensppFields.length === 1 ? '' : 's' }} loaded.
        </v-alert>

        <!-- Entity Forms with mapping -->
        <div v-if="hasEntityForms" class="entity-forms-mapping mt-4">
          <v-card
            v-for="(entityForm, index) in draftStore.draft.entityForms"
            :key="index"
            variant="outlined"
            class="pa-4 mb-3"
          >
            <div class="d-flex align-center justify-space-between">
              <div>
                <span class="font-weight-medium">
                  {{ entityForm.title || entityForm.name }}
                </span>
                <v-chip size="x-small" class="ml-2">
                  {{ getFormFields(entityForm.formio).length }} fields
                </v-chip>
              </div>
              <v-btn
                v-if="entityForm.formio && opensppFields.length > 0"
                color="primary"
                variant="text"
                size="small"
                @click="goToFieldMapping"
              >
                Map Fields
              </v-btn>
            </div>
            <div v-if="draftStore.draft.externalSync?.fieldMappings?.length" class="mt-3">
              <v-chip
                v-for="(mapping, idx) in draftStore.draft.externalSync.fieldMappings"
                :key="idx"
                size="small"
                class="mr-2 mb-2"
              >
                {{ mapping.formField }} -> {{ mapping.opensppField }}
              </v-chip>
            </div>
          </v-card>
        </div>

        <v-alert
          v-else
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          Add entity forms in the previous step before configuring field mappings.
        </v-alert>
      </div>
    </v-form>

    <!-- OpenSPP Field Input Dialog -->
    <OpenSppFieldInputDialog
      v-model="showOpenSppFieldInput"
      @fields-parsed="onOpenSppFieldsParsed"
    />
  </div>
</template>

<style scoped>
.sync-step {
  max-width: 800px;
  margin: 0 auto;
}

.step-description {
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 32px;
  line-height: 1.6;
}

.sync-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.87);
}

.form-label .required {
  color: rgb(var(--v-theme-error));
  margin-left: 2px;
}

.form-hint {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  margin: 0;
  margin-top: -4px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.openspp-mapping {
  padding-top: 24px;
}
</style>
