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
import { computed, ref, watch } from 'vue'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import type { ParsedOpenSppField, FieldMapping } from '@/api'
import OpenSppFieldInputDialog from '@/components/OpenSppFieldInputDialog.vue'
import OpenSppV2FieldFetcher from '@/components/OpenSppV2FieldFetcher.vue'
import { getFormFields } from '@/utils/formioFields'

const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const showOpenSppFieldInput = ref(false)
const opensppV1Fields = ref<ParsedOpenSppField[]>([])
const expandedRows = ref<Record<number, boolean>>({})

// Determine adapter type
const isV2Adapter = computed(() => {
  return draftStore.draft.externalSync?.type === 'openspp-v2-adapter'
})

const isV1Adapter = computed(() => {
  const type = draftStore.draft.externalSync?.type
  return type === 'openspp-adapter' || type === 'openspp-v1-adapter'
})

const isOpenSppAdapter = computed(() => {
  return isV1Adapter.value || isV2Adapter.value
})

// Get mappings from store (reactive)
const mappings = computed({
  get: () => draftStore.draft.externalSync?.fieldMappings || [],
  set: (value) => {
    if (!draftStore.draft.externalSync) {
      draftStore.draft.externalSync = {
        type: undefined,
        url: '',
        extraFields: [],
        adapterConfig: {},
      }
    }
    draftStore.draft.externalSync.fieldMappings = value
  },
})

// Get all form fields from all entity forms
const allFormFields = computed(() => {
  const fields: Array<{ key: string; label: string; formName: string }> = []

  draftStore.draft.entityForms.forEach((entityForm) => {
    const formFields = getFormFields(entityForm.formio)
    formFields.forEach((field) => {
      fields.push({
        ...field,
        formName: entityForm.title || entityForm.name,
      })
    })
  })

  return fields
})

const formFieldItems = computed(() => {
  return allFormFields.value.map((field) => ({
    title: field.label || field.key,
    value: field.key,
    subtitle: `${field.formName} - ${field.key}`,
  }))
})

// OpenSPP field items - different sources for V1 vs V2
const opensppFieldItems = computed(() => {
  if (isV2Adapter.value) {
    // Use V2 fields from store
    return (draftStore.draft.opensppV2Fields || []).map((field) => ({
      title: field.label || field.name,
      value: field.name,
      subtitle: `${field.name} (${field.type}) - ${field.source}`,
      field: {
        name: field.name,
        type: field.type === 'date' ? 'date' : field.type === 'integer' ? 'relation' : 'text',
        label: field.label,
      },
    }))
  } else {
    // Use V1 fields from local state
    return opensppV1Fields.value.map((field) => ({
      title: field.label || field.name,
      value: field.name,
      subtitle: field.name !== (field.label || field.name) ? `${field.name} (${field.type})` : `(${field.type})`,
      field,
    }))
  }
})

const hasOpenSppFields = computed(() => {
  if (isV2Adapter.value) {
    return (draftStore.draft.opensppV2Fields?.length || 0) > 0
  }
  return opensppV1Fields.value.length > 0
})

const opensppFieldCount = computed(() => {
  if (isV2Adapter.value) {
    return draftStore.draft.opensppV2Fields?.length || 0
  }
  return opensppV1Fields.value.length
})

// V1 field import handler
const onOpenSppFieldsParsed = (fields: ParsedOpenSppField[]) => {
  opensppV1Fields.value = fields
  snackBarStore.showSnackbar(`Loaded ${fields.length} OpenSPP fields`, 'success')
}

const addMapping = () => {
  const newMappings = [...mappings.value]
  newMappings.push({
    formField: '',
    opensppField: '',
    transformer: {
      type: 'text',
      options: {},
    },
  })
  mappings.value = newMappings
}

const removeMapping = (index: number) => {
  const newMappings = [...mappings.value]
  newMappings.splice(index, 1)
  mappings.value = newMappings
  delete expandedRows.value[index]
}

const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
  const newMappings = [...mappings.value]
  newMappings[index] = { ...newMappings[index], ...updates }
  mappings.value = newMappings
}

const updateTransformerOptions = (index: number, opensppFieldName: string) => {
  const opensppField = opensppFieldItems.value.find((f) => f.value === opensppFieldName)?.field
  if (!opensppField) return

  const mapping = mappings.value[index]
  if (!mapping) return

  let transformerType: FieldMapping['transformer']['type'] = 'text'
  const options: FieldMapping['transformer']['options'] = {}

  if (opensppField.type === 'relation') {
    transformerType = 'id'
  } else if (opensppField.type === 'date') {
    transformerType = 'date'
    options.inputFormat = 'auto'
    options.outputFormat = 'YYYY-MM-DD'
  }

  updateMapping(index, {
    transformer: { type: transformerType, options },
  })
}

// Watch for transformer type changes and set default options
watch(
  () => mappings.value.map((m) => m.transformer.type),
  () => {
    const newMappings = mappings.value.map((mapping) => {
      const newMapping = { ...mapping }
      if (!newMapping.transformer.options) {
        newMapping.transformer.options = {}
      }

      if (newMapping.transformer.type === 'multiselect') {
        if (!newMapping.transformer.options.delimiter) {
          newMapping.transformer.options.delimiter = ','
        }
      }
      if (newMapping.transformer.type === 'boolean') {
        if (!newMapping.transformer.options.truthyValue) {
          newMapping.transformer.options.truthyValue = 'true'
        }
        if (!newMapping.transformer.options.falsyValue) {
          newMapping.transformer.options.falsyValue = 'false'
        }
      }
      return newMapping
    })
    // Only update if there are actual changes
    if (JSON.stringify(newMappings) !== JSON.stringify(mappings.value)) {
      mappings.value = newMappings
    }
  },
  { deep: true }
)

const isRowExpanded = (index: number): boolean => {
  return !!expandedRows.value[index]
}

const toggleRowExpansion = (index: number) => {
  expandedRows.value[index] = !expandedRows.value[index]
}
</script>

<template>
  <div class="mapping-step">
    <p class="step-description">
      Map form fields to OpenSPP fields to ensure data is correctly synchronized.
      <template v-if="isV2Adapter">
        Fields are automatically fetched from the OpenSPP V2 API.
      </template>
      <template v-else-if="isV1Adapter">
        Import fields from OpenSPP using a sample payload or API fetch.
      </template>
    </p>

    <!-- No adapter selected warning -->
    <v-alert
      v-if="!isOpenSppAdapter"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      <template v-if="draftStore.draft.externalSync?.type">
        Field mapping is only available for OpenSPP adapters. The selected adapter
        ({{ draftStore.draft.externalSync.type }}) does not require field mapping.
      </template>
      <template v-else>
        Select an integration type in the Integration step to configure field mapping.
      </template>
    </v-alert>

    <!-- V2 Field Fetcher -->
    <div v-if="isV2Adapter" class="field-source-section">
      <OpenSppV2FieldFetcher />
    </div>

    <!-- V1 Field Import -->
    <div v-else-if="isV1Adapter" class="field-source-section">
      <div class="v1-field-header">
        <div class="v1-field-header__info">
          <h4>OpenSPP V1 Fields</h4>
          <p>Import fields from a sample payload or fetch directly from the Odoo API.</p>
        </div>
        <v-btn
          color="primary"
          variant="outlined"
          @click="showOpenSppFieldInput = true"
        >
          <v-icon start icon="mdi-upload" />
          Import Fields
        </v-btn>
      </div>

      <v-alert
        v-if="opensppV1Fields.length === 0"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-4"
      >
        Import OpenSPP fields to enable field mapping.
      </v-alert>

      <v-alert
        v-else
        type="success"
        variant="tonal"
        density="compact"
        class="mt-4"
      >
        {{ opensppV1Fields.length }} OpenSPP field{{ opensppV1Fields.length === 1 ? '' : 's' }} loaded.
      </v-alert>
    </div>

    <!-- Field Mapping Section -->
    <div v-if="isOpenSppAdapter" class="mapping-section">
      <v-divider class="my-6" />

      <!-- Field Status -->
      <div class="field-status">
        <v-chip size="small" variant="tonal" color="primary">
          {{ allFormFields.length }} Form Fields
        </v-chip>
        <v-chip size="small" variant="tonal" :color="hasOpenSppFields ? 'success' : 'warning'">
          {{ opensppFieldCount }} OpenSPP Fields
        </v-chip>
        <v-chip size="small" variant="tonal" color="info">
          {{ mappings.length }} Mappings
        </v-chip>
      </div>

      <!-- Empty State -->
      <div v-if="mappings.length === 0" class="empty-state">
        <v-icon icon="mdi-link-variant" size="64" color="grey-lighten-1" />
        <h3>No Field Mappings</h3>
        <p>Create mappings to define how form data maps to OpenSPP fields.</p>
        <v-btn
          color="primary"
          size="large"
          :disabled="!hasOpenSppFields"
          @click="addMapping"
        >
          <v-icon start icon="mdi-plus" />
          Add Mapping
        </v-btn>
      </div>

      <!-- Mappings Table -->
      <div v-else class="mappings-container">
        <v-table density="compact" class="mappings-table">
          <thead>
            <tr>
              <th style="width: 25%">Form Field</th>
              <th style="width: 25%">OpenSPP Field</th>
              <th style="width: 20%">Transformer</th>
              <th style="width: 20%">Options</th>
              <th style="width: 10%" class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(mapping, index) in mappings" :key="index">
              <tr class="mapping-row">
                <td>
                  <v-autocomplete
                    :model-value="mapping.formField"
                    :items="formFieldItems"
                    placeholder="Select form field"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                    item-title="title"
                    item-value="value"
                    :menu-props="{ maxHeight: 300 }"
                    @update:model-value="updateMapping(index, { formField: $event })"
                  />
                </td>
                <td>
                  <v-autocomplete
                    :model-value="mapping.opensppField"
                    :items="opensppFieldItems"
                    placeholder="Select OpenSPP field"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                    item-title="title"
                    item-value="value"
                    :menu-props="{ maxHeight: 300 }"
                    @update:model-value="(val: string) => { updateMapping(index, { opensppField: val }); updateTransformerOptions(index, val) }"
                  />
                </td>
                <td>
                  <v-select
                    :model-value="mapping.transformer.type"
                    :items="[
                      { title: 'Text', value: 'text' },
                      { title: 'Date', value: 'date' },
                      { title: 'ID', value: 'id' },
                      { title: 'Multi-select', value: 'multiselect' },
                      { title: 'Boolean', value: 'boolean' },
                    ]"
                    density="compact"
                    variant="outlined"
                    hide-details
                    @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, type: $event } })"
                  />
                </td>
                <td>
                  <div class="d-flex align-center gap-1">
                    <template v-if="mapping.transformer.type === 'date'">
                      <v-chip size="x-small" variant="tonal" color="primary">
                        {{ mapping.transformer.options?.inputFormat || 'auto' }}
                      </v-chip>
                      <span class="text-caption text-medium-emphasis">-></span>
                      <v-chip size="x-small" variant="tonal" color="primary">
                        {{ mapping.transformer.options?.outputFormat || 'YYYY-MM-DD' }}
                      </v-chip>
                    </template>
                    <template v-else-if="mapping.transformer.type === 'id'">
                      <span class="text-caption text-medium-emphasis">ID conversion</span>
                    </template>
                    <template v-else-if="mapping.transformer.type === 'multiselect'">
                      <v-chip size="x-small" variant="tonal" color="primary">
                        {{ mapping.transformer.options?.delimiter || ',' }}
                      </v-chip>
                    </template>
                    <template v-else-if="mapping.transformer.type === 'boolean'">
                      <span class="text-caption text-medium-emphasis">
                        {{ mapping.transformer.options?.truthyValue || 'true' }}/{{ mapping.transformer.options?.falsyValue || 'false' }}
                      </span>
                    </template>
                    <template v-else>
                      <span class="text-caption text-medium-emphasis">Default</span>
                    </template>
                    <v-btn
                      v-if="mapping.transformer.type !== 'text'"
                      icon
                      size="x-small"
                      variant="text"
                      @click="toggleRowExpansion(index)"
                    >
                      <v-icon size="16">
                        {{ isRowExpanded(index) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                      </v-icon>
                    </v-btn>
                  </div>
                </td>
                <td class="text-center">
                  <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="error"
                    @click="removeMapping(index)"
                  >
                    <v-icon size="18">mdi-delete-outline</v-icon>
                  </v-btn>
                </td>
              </tr>
              <!-- Expanded options row -->
              <tr v-if="isRowExpanded(index)" class="options-row">
                <td colspan="5" class="pa-3">
                  <v-card variant="outlined" class="pa-3">
                    <template v-if="mapping.transformer.type === 'date'">
                      <v-row dense>
                        <v-col cols="12" sm="6">
                          <v-select
                            :model-value="mapping.transformer.options?.inputFormat"
                            :items="[
                              { title: 'Auto-detect', value: 'auto' },
                              { title: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
                              { title: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
                              { title: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
                            ]"
                            label="Input Format"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, options: { ...mapping.transformer.options, inputFormat: $event } } })"
                          />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-select
                            :model-value="mapping.transformer.options?.outputFormat"
                            :items="[
                              { title: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
                              { title: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
                              { title: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
                            ]"
                            label="Output Format"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, options: { ...mapping.transformer.options, outputFormat: $event } } })"
                          />
                        </v-col>
                      </v-row>
                    </template>

                    <template v-if="mapping.transformer.type === 'id'">
                      <v-alert type="info" variant="tonal" density="compact">
                        ID Transformer: Converts form values to integers for OpenSPP, and extracts IDs from OpenSPP objects.
                      </v-alert>
                    </template>

                    <template v-if="mapping.transformer.type === 'multiselect'">
                      <v-text-field
                        :model-value="mapping.transformer.options?.delimiter"
                        label="Delimiter"
                        hint="String used to join array values"
                        density="compact"
                        variant="outlined"
                        persistent-hint
                        @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, options: { ...mapping.transformer.options, delimiter: $event } } })"
                      />
                    </template>

                    <template v-if="mapping.transformer.type === 'boolean'">
                      <v-row dense>
                        <v-col cols="12" sm="6">
                          <v-text-field
                            :model-value="mapping.transformer.options?.truthyValue"
                            label="Truthy Value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, options: { ...mapping.transformer.options, truthyValue: $event } } })"
                          />
                        </v-col>
                        <v-col cols="12" sm="6">
                          <v-text-field
                            :model-value="mapping.transformer.options?.falsyValue"
                            label="Falsy Value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="updateMapping(index, { transformer: { ...mapping.transformer, options: { ...mapping.transformer.options, falsyValue: $event } } })"
                          />
                        </v-col>
                      </v-row>
                    </template>
                  </v-card>
                </td>
              </tr>
            </template>
          </tbody>
        </v-table>

        <v-btn
          color="primary"
          variant="outlined"
          class="mt-4"
          :disabled="!hasOpenSppFields"
          @click="addMapping"
        >
          <v-icon start icon="mdi-plus" />
          Add Mapping
        </v-btn>
      </div>
    </div>

    <!-- OpenSPP V1 Field Input Dialog -->
    <OpenSppFieldInputDialog
      v-model="showOpenSppFieldInput"
      @fields-parsed="onOpenSppFieldsParsed"
    />
  </div>
</template>

<style scoped>
.mapping-step {
  max-width: 1000px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}

.field-source-section {
  margin-bottom: var(--spacing-lg);
}

.v1-field-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.v1-field-header__info h4 {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0 0 var(--spacing-xs);
  color: var(--text-main);
}

.v1-field-header__info p {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin: 0;
}

.mapping-section {
  margin-top: var(--spacing-lg);
}

.field-status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.empty-state h3 {
  margin: var(--spacing-md) 0 var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-main);
}

.empty-state p {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
}

.mappings-container {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.mappings-table {
  width: 100%;
}

.mappings-table :deep(thead th) {
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  padding: var(--spacing-sm);
  background: var(--neutral-50);
  color: var(--text-muted);
}

.mappings-table :deep(tbody td) {
  padding: var(--spacing-sm);
  vertical-align: middle;
}

.mapping-row {
  border-bottom: 1px solid var(--border-light);
}

.options-row {
  background: var(--neutral-50);
}

.gap-1 {
  gap: var(--spacing-xs);
}
</style>
