<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ParsedOpenSppField, FieldMapping } from '@/api'

interface Props {
  modelValue: boolean
  formFields: Array<{ key: string; label: string }>
  opensppFields: ParsedOpenSppField[]
  existingMappings?: FieldMapping[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [mappings: FieldMapping[]]
}>()

const dialog = ref(false)
const mappings = ref<FieldMapping[]>([])

watch(() => props.modelValue, (val) => {
  dialog.value = val
  if (val) {
    // Initialize mappings from existing or create empty
    if (props.existingMappings && props.existingMappings.length > 0) {
      mappings.value = JSON.parse(JSON.stringify(props.existingMappings))
    } else {
      mappings.value = []
    }
    // Reset expanded rows when dialog opens
    expandedRows.value = {}
  }
})

watch(dialog, (val) => {
  emit('update:modelValue', val)
})

// Watch for transformer type changes and set default options
watch(
  () => mappings.value.map(m => m.transformer.type),
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
  // Clean up expanded state for removed mapping and adjust indices
  delete expandedRows.value[index]
  // Shift all expanded states down by one for indices after the removed one
  const newExpandedRows: Record<number, boolean> = {}
  Object.keys(expandedRows.value).forEach((key) => {
    const idx = Number(key)
    if (idx > index) {
      newExpandedRows[idx - 1] = expandedRows.value[idx]
    } else if (idx < index) {
      newExpandedRows[idx] = expandedRows.value[idx]
    }
  })
  expandedRows.value = newExpandedRows
}

const updateTransformerOptions = (index: number, opensppFieldName: string) => {
  const mapping = mappings.value[index]
  if (!mapping) return

  const opensppField = props.opensppFields.find((f) => f.name === opensppFieldName)
  if (!opensppField) return

  // Update transformer type based on OpenSPP field type
  // Map 'relation' type from OpenSPP to 'id' transformer
  if (opensppField.type === 'relation') {
    mapping.transformer.type = 'id'
  } else if (opensppField.type === 'date') {
    mapping.transformer.type = 'date'
  } else if (opensppField.type === 'selection') {
    // Selection fields can be mapped to multiselect or boolean transformers
    // Default to text for now, but user can change to multiselect or boolean
    mapping.transformer.type = 'text'
  } else {
    mapping.transformer.type = 'text'
  }

  // Set default options based on transformer type
  // Note: User can manually change transformer type, so we check the actual value
  const transformerType = mapping.transformer.type as 'text' | 'date' | 'id' | 'multiselect' | 'boolean'

  // Set default date format
  if (transformerType === 'date') {
    if (!mapping.transformer.options) {
      mapping.transformer.options = {}
    }
    if (!mapping.transformer.options.inputFormat) {
      mapping.transformer.options.inputFormat = 'auto'
    }
    if (!mapping.transformer.options.outputFormat) {
      mapping.transformer.options.outputFormat = 'YYYY-MM-DD'
    }
  }

  // Set default options for multiselect
  if (transformerType === 'multiselect') {
    if (!mapping.transformer.options) {
      mapping.transformer.options = {}
    }
    if (!mapping.transformer.options.delimiter) {
      mapping.transformer.options.delimiter = ','
    }
  }

  // Set default options for boolean
  if (transformerType === 'boolean') {
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
}

const saveMappings = () => {
  emit('save', mappings.value)
  dialog.value = false
}

const formFieldItems = computed(() => {
  return props.formFields.map((field) => ({
    title: field.label || field.key,
    value: field.key,
    subtitle: field.key !== field.label ? field.key : undefined,
  }))
})

const opensppFieldItems = computed(() => {
  return props.opensppFields.map((field) => {
    const item: {
      title: string
      value: string
      subtitle?: string
      field: typeof field
    } = {
      title: field.label || field.name,
      value: field.name,
      field,
    }
    
    // Add subtitle with field name and type for better searchability
    if (field.name !== item.title) {
      item.subtitle = `${field.name} (${field.type})`
    } else {
      item.subtitle = `(${field.type})`
    }
    
    return item
  })
})

const expandedRows = ref<Record<number, boolean>>({})

const isRowExpanded = (index: number): boolean => {
  return !!(expandedRows.value && expandedRows.value[index])
}

const toggleRowExpansion = (index: number) => {
  expandedRows.value[index] = !expandedRows.value[index]
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="1200" persistent scrollable>
    <v-card class="field-mapping-dialog">
      <v-card-title class="pb-2">Map Form Fields to OpenSPP Fields</v-card-title>
      <v-card-subtitle class="text-caption">
        Map form fields to OpenSPP fields and configure transformers for data format conversion.
      </v-card-subtitle>
      
      <v-card-text class="pa-3 mapping-content">
        <div v-if="mappings.length === 0" class="text-center py-8">
          <p class="text-body-2 text-medium-emphasis mb-4">No field mappings yet</p>
          <v-btn color="primary" size="small" @click="addMapping">Add Mapping</v-btn>
        </div>

        <div v-else>
          <div class="mapping-container">
            <v-table density="compact" class="mapping-table">
            <thead>
              <tr>
                <th class="text-left" style="width: 25%">Form Field</th>
                <th class="text-left" style="width: 25%">OpenSPP Field</th>
                <th class="text-left" style="width: 20%">Transformer</th>
                <th class="text-left" style="width: 20%">Options</th>
                <th class="text-center" style="width: 10%">Actions</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(mapping, index) in mappings" :key="index">
                <tr class="mapping-row">
                  <td>
                    <v-autocomplete
                      v-model="mapping.formField"
                      :items="formFieldItems"
                      placeholder="Type to search..."
                      density="compact"
                      variant="outlined"
                      hide-details
                      clearable
                      no-data-text="No fields found"
                      item-title="title"
                      item-subtitle="subtitle"
                      item-value="value"
                      prepend-inner-icon="mdi-magnify"
                      auto-select-first
                      :menu-props="{ maxHeight: 300 }"
                    />
                  </td>
                  <td>
                    <v-autocomplete
                      v-model="mapping.opensppField"
                      :items="opensppFieldItems"
                      placeholder="Type to search..."
                      density="compact"
                      variant="outlined"
                      hide-details
                      clearable
                      no-data-text="No fields found"
                      item-title="title"
                      item-subtitle="subtitle"
                      item-value="value"
                      prepend-inner-icon="mdi-magnify"
                      auto-select-first
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
                      <!-- Date options summary -->
                      <template v-if="mapping.transformer.type === 'date'">
                        <v-chip size="x-small" variant="tonal" color="primary">
                          {{ mapping.transformer.options?.inputFormat || 'auto' }}
                        </v-chip>
                        <span class="text-caption text-medium-emphasis">→</span>
                        <v-chip size="x-small" variant="tonal" color="primary">
                          {{ mapping.transformer.options?.outputFormat || 'YYYY-MM-DD' }}
                        </v-chip>
                      </template>
                      <!-- ID options summary -->
                      <template v-else-if="mapping.transformer.type === 'id'">
                        <span class="text-caption text-medium-emphasis">Form → Integer | Object → ID</span>
                      </template>
                      <!-- Multi-select options summary -->
                      <template v-else-if="mapping.transformer.type === 'multiselect'">
                        <v-chip size="x-small" variant="tonal" color="primary">
                          Delimiter: {{ mapping.transformer.options?.delimiter || ',' }}
                        </v-chip>
                      </template>
                      <!-- Boolean summary -->
                      <template v-else-if="mapping.transformer.type === 'boolean'">
                        <v-chip size="x-small" variant="tonal" color="primary">
                          {{ mapping.transformer.options?.truthyValue || 'true' }}
                        </v-chip>
                        <span class="text-caption text-medium-emphasis">→</span>
                        <v-chip size="x-small" variant="tonal" color="primary">
                          {{ mapping.transformer.options?.falsyValue || 'false' }}
                        </v-chip>
                      </template>
                      <!-- Text or default -->
                      <template v-else>
                        <span class="text-caption text-medium-emphasis">Default</span>
                      </template>
                      <v-btn
                        v-if="mapping.transformer.type !== 'text'"
                        icon
                        size="x-small"
                        variant="text"
                        density="compact"
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
                      density="compact"
                      @click="removeMapping(index)"
                    >
                      <v-icon size="18">mdi-delete-outline</v-icon>
                    </v-btn>
                  </td>
                </tr>
                <!-- Expanded options row -->
                <tr v-if="isRowExpanded(index)" class="mapping-options-row">
                  <td colspan="5" class="pa-2">
                    <v-card variant="outlined" density="compact" class="pa-3">
                      <!-- Date Transformer Options -->
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

                      <!-- ID Transformer Options -->
                      <template v-if="mapping.transformer.type === 'id'">
                        <v-alert
                          type="info"
                          variant="tonal"
                          density="compact"
                        >
                          <div class="text-caption">
                            <strong>ID Transformer:</strong> Handles ID values between form and OpenSPP formats.
                            <br />
                            <br />
                            <strong>Transform (Form → OpenSPP):</strong> Converts form values (ID number/string) to an integer that OpenSPP expects.
                            <br />
                            <strong>Reverse Transform (OpenSPP → Form):</strong> Extracts the "id" field from {"id": 0, "display_name": ""} objects received from OpenSPP.
                          </div>  
                        </v-alert>
                      </template>

                      <!-- Multi-select Transformer Options -->
                      <template v-if="mapping.transformer.type === 'multiselect'">
                        <v-text-field
                          v-model="mapping.transformer.options!.delimiter"
                          label="Delimiter"
                          hint="String used to join array values (default: comma)"
                          density="compact"
                          variant="outlined"
                          persistent-hint
                        />
                        <v-alert
                          type="info"
                          variant="tonal"
                          density="compact"
                          class="mt-2"
                        >
                          <div class="text-caption">
                            Supports both Form.io component types:
                            <br />
                            • <strong>Select Boxes</strong> (array): Joins array values into a delimited string
                            <br />
                            • <strong>Checkboxes</strong> (object): Extracts keys where value is true and joins them
                            <br />
                            <br />
                            <strong>Transform:</strong> Object/Array → Delimited string (e.g., "key1,key2,key3")
                            <br />
                            <strong>Reverse Transform:</strong> Delimited string → Object with selected keys set to true
                          </div>
                        </v-alert>
                      </template>

                      <!-- Boolean Transformer Options -->
                      <template v-if="mapping.transformer.type === 'boolean'">
                        <v-row dense>
                          <v-col cols="12" sm="6">
                            <v-text-field
                              v-model="mapping.transformer.options!.truthyValue"
                              label="Truthy Value"
                              hint="Value treated as true (default: true)"
                              density="compact"
                              variant="outlined"
                              persistent-hint
                              placeholder="true"
                            />
                          </v-col>
                          <v-col cols="12" sm="6">
                            <v-text-field
                              v-model="mapping.transformer.options!.falsyValue"
                              label="Falsy Value"
                              hint="Value treated as false (default: false)"
                              density="compact"
                              variant="outlined"
                              persistent-hint
                              placeholder="false"
                            />
                          </v-col>
                        </v-row>
                        <v-alert
                          type="info"
                          variant="tonal"
                          density="compact"
                          class="mt-2"
                        >
                          <div class="text-caption">
                            Values are case-insensitive and trimmed. Used to normalize checkbox/dropdown values to boolean.
                          </div>
                        </v-alert>
                      </template>
                    </v-card>
                  </td>
                </tr>
              </template>
            </tbody>
          </v-table>
          </div>

          <div class="mt-3">
            <v-btn
              color="primary"
              variant="outlined"
              size="small"
              prepend-icon="mdi-plus"
              density="compact"
              @click="addMapping"
            >
              Add Mapping
            </v-btn>
          </div>
        </div>
      </v-card-text>
      
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="text" size="small" @click="dialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          size="small"
          :disabled="mappings.length === 0"
          @click="saveMappings"
        >
          Save Mappings
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.field-mapping-dialog {
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.mapping-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mapping-container {
  flex: 1;
  overflow-y: auto;
  max-height: calc(85vh - 280px);
  min-height: 200px;
}

.mapping-table {
  width: 100%;
}

.mapping-table :deep(thead th) {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.02);
  border-bottom: 2px solid rgba(0, 0, 0, 0.1);
}

.mapping-table :deep(tbody td) {
  padding: 8px 12px;
  vertical-align: middle;
}

.mapping-row {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.mapping-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.mapping-options-row {
  background-color: rgba(0, 0, 0, 0.01);
}

.mapping-options-row td {
  border-top: none !important;
}

.field-mapping-dialog :deep(.v-select) {
  font-size: 0.875rem;
}

.field-mapping-dialog :deep(.v-field__input) {
  min-height: 32px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.field-mapping-dialog :deep(.v-select__selection) {
  font-size: 0.875rem;
}

.gap-1 {
  gap: 4px;
}
</style>
