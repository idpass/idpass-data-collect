<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import type { ParsedOpenSppField, FieldMapping } from '@/api'
import OpenSppFieldInputDialog from '@/components/OpenSppFieldInputDialog.vue'
import { getFormFields } from '@/utils/formioFields'

const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const showOpenSppFieldInput = ref(false)
const opensppFields = ref<ParsedOpenSppField[]>([])
const mappings = ref<FieldMapping[]>([])
const expandedRows = ref<Record<number, boolean>>({})

// Initialize mappings from store
onMounted(() => {
  if (draftStore.draft.externalSync?.fieldMappings?.length) {
    mappings.value = JSON.parse(JSON.stringify(draftStore.draft.externalSync.fieldMappings))
  }
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

const opensppFieldItems = computed(() => {
  return opensppFields.value.map((field) => ({
    title: field.label || field.name,
    value: field.name,
    subtitle: field.name !== (field.label || field.name) ? `${field.name} (${field.type})` : `(${field.type})`,
    field,
  }))
})

const onOpenSppFieldsParsed = (fields: ParsedOpenSppField[]) => {
  opensppFields.value = fields
  snackBarStore.showSnackbar(`Loaded ${fields.length} OpenSPP fields`, 'success')
}

const addMapping = () => {
  mappings.value.push({
    formField: '',
    opensppField: '',
    transformer: {
      type: 'text',
      options: {},
    },
  })
}

const removeMapping = (index: number) => {
  mappings.value.splice(index, 1)
  delete expandedRows.value[index]
}

const updateTransformerOptions = (index: number, opensppFieldName: string) => {
  const mapping = mappings.value[index]
  if (!mapping) return

  const opensppField = opensppFields.value.find((f) => f.name === opensppFieldName)
  if (!opensppField) return

  if (opensppField.type === 'relation') {
    mapping.transformer.type = 'id'
  } else if (opensppField.type === 'date') {
    mapping.transformer.type = 'date'
    if (!mapping.transformer.options) {
      mapping.transformer.options = {}
    }
    mapping.transformer.options.inputFormat = 'auto'
    mapping.transformer.options.outputFormat = 'YYYY-MM-DD'
  } else {
    mapping.transformer.type = 'text'
  }
}

// Watch for transformer type changes and set default options
watch(
  () => mappings.value.map((m) => m.transformer.type),
  () => {
    mappings.value.forEach((mapping) => {
      if (mapping.transformer.type === 'multiselect') {
        if (!mapping.transformer.options) {
          mapping.transformer.options = {}
        }
        if (!mapping.transformer.options.delimiter) {
          mapping.transformer.options.delimiter = ','
        }
      }
      if (mapping.transformer.type === 'boolean') {
        if (!mapping.transformer.options) {
          mapping.transformer.options = {}
        }
        if (!mapping.transformer.options.truthyValue) {
          mapping.transformer.options.truthyValue = 'true'
        }
        if (!mapping.transformer.options.falsyValue) {
          mapping.transformer.options.falsyValue = 'false'
        }
      }
    })
  },
  { deep: true }
)

const isRowExpanded = (index: number): boolean => {
  return !!expandedRows.value[index]
}

const toggleRowExpansion = (index: number) => {
  expandedRows.value[index] = !expandedRows.value[index]
}

const saveMappings = () => {
  if (!draftStore.draft.externalSync) {
    draftStore.draft.externalSync = {
      type: undefined,
      url: '',
      extraFields: [],
      adapterConfig: {},
    }
  }
  draftStore.draft.externalSync.fieldMappings = mappings.value
  snackBarStore.showSnackbar(`Saved ${mappings.value.length} field mappings`, 'success')
  router.push({ name: 'wizard-sync' })
}

const cancel = () => {
  router.push({ name: 'wizard-sync' })
}
</script>

<template>
  <div class="mapping-step">
    <!-- Header -->
    <div class="mapping-header">
      <div class="mapping-header__info">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="cancel" />
        <div>
          <h2>Field Mapping</h2>
          <p>Map form fields to OpenSPP fields for data synchronization</p>
        </div>
      </div>
      <div class="mapping-header__actions">
        <v-btn variant="outlined" size="small" @click="showOpenSppFieldInput = true">
          <v-icon start icon="mdi-upload" />
          Import OpenSPP Fields
        </v-btn>
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" @click="saveMappings">
          <v-icon start icon="mdi-content-save" />
          Save Mappings
        </v-btn>
      </div>
    </div>

    <!-- Field Status -->
    <div class="field-status">
      <v-chip size="small" variant="tonal" color="primary">
        {{ allFormFields.length }} Form Fields
      </v-chip>
      <v-chip size="small" variant="tonal" :color="opensppFields.length > 0 ? 'success' : 'warning'">
        {{ opensppFields.length }} OpenSPP Fields
      </v-chip>
      <v-chip size="small" variant="tonal" color="info">
        {{ mappings.length }} Mappings
      </v-chip>
    </div>

    <!-- Alert if no OpenSPP fields -->
    <v-alert
      v-if="opensppFields.length === 0"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      Import OpenSPP fields first to create mappings. Click "Import OpenSPP Fields" above.
    </v-alert>

    <!-- Empty State -->
    <div v-if="mappings.length === 0" class="empty-state">
      <v-icon icon="mdi-link-variant" size="64" color="grey-lighten-1" />
      <h3>No Field Mappings</h3>
      <p>Create mappings to define how form data maps to OpenSPP fields.</p>
      <v-btn color="primary" size="large" :disabled="opensppFields.length === 0" @click="addMapping">
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
                  v-model="mapping.formField"
                  :items="formFieldItems"
                  placeholder="Select form field"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  item-title="title"
                  item-value="value"
                  :menu-props="{ maxHeight: 300 }"
                />
              </td>
              <td>
                <v-autocomplete
                  v-model="mapping.opensppField"
                  :items="opensppFieldItems"
                  placeholder="Select OpenSPP field"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  item-title="title"
                  item-value="value"
                  :menu-props="{ maxHeight: 300 }"
                  @update:model-value="updateTransformerOptions(index, $event)"
                />
              </td>
              <td>
                <v-select
                  v-model="mapping.transformer.type"
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
                          v-model="mapping.transformer.options!.inputFormat"
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
                        />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-select
                          v-model="mapping.transformer.options!.outputFormat"
                          :items="[
                            { title: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
                            { title: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
                            { title: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
                          ]"
                          label="Output Format"
                          density="compact"
                          variant="outlined"
                          hide-details
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
                      v-model="mapping.transformer.options!.delimiter"
                      label="Delimiter"
                      hint="String used to join array values"
                      density="compact"
                      variant="outlined"
                      persistent-hint
                    />
                  </template>

                  <template v-if="mapping.transformer.type === 'boolean'">
                    <v-row dense>
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="mapping.transformer.options!.truthyValue"
                          label="Truthy Value"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="12" sm="6">
                        <v-text-field
                          v-model="mapping.transformer.options!.falsyValue"
                          label="Falsy Value"
                          density="compact"
                          variant="outlined"
                          hide-details
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

      <v-btn color="primary" variant="outlined" class="mt-4" @click="addMapping">
        <v-icon start icon="mdi-plus" />
        Add Mapping
      </v-btn>
    </div>

    <!-- OpenSPP Field Input Dialog -->
    <OpenSppFieldInputDialog
      v-model="showOpenSppFieldInput"
      @fields-parsed="onOpenSppFieldsParsed"
    />
  </div>
</template>

<style scoped>
.mapping-step {
  margin: calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-lg)) calc(-1 * var(--spacing-lg));
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 200px);
}

.mapping-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-light);
  background: var(--surface);
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.mapping-header__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.mapping-header__info h2 {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.mapping-header__info p {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 0;
}

.mapping-header__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.field-status {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-light);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  flex: 1;
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
  padding: var(--spacing-lg);
  flex: 1;
  overflow: auto;
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
