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
  }
})

watch(dialog, (val) => {
  emit('update:modelValue', val)
})

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
}

const getFieldOptions = (opensppField: ParsedOpenSppField | undefined) => {
  if (!opensppField) return []
  if (opensppField.type === 'relation' && opensppField.options) {
    return opensppField.options
  }
  return []
}

const updateTransformerOptions = (index: number, opensppFieldName: string) => {
  const mapping = mappings.value[index]
  if (!mapping) return

  const opensppField = props.opensppFields.find((f) => f.name === opensppFieldName)
  if (!opensppField) return

  // Update transformer type based on OpenSPP field type
  mapping.transformer.type = opensppField.type

  // Set default options for relation fields
  if (opensppField.type === 'relation' && opensppField.options) {
    if (!mapping.transformer.options) {
      mapping.transformer.options = {}
    }
    mapping.transformer.options.relationOptions = opensppField.options
    if (!mapping.transformer.options.relationOutputFormat) {
      mapping.transformer.options.relationOutputFormat = '[id,label]'
    }
  }

  // Set default date format
  if (opensppField.type === 'date') {
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
}

const saveMappings = () => {
  emit('save', mappings.value)
  dialog.value = false
}

const formFieldItems = computed(() => {
  return props.formFields.map((field) => ({
    title: field.label || field.key,
    value: field.key,
  }))
})

const opensppFieldItems = computed(() => {
  return props.opensppFields.map((field) => ({
    title: field.label || field.name,
    value: field.name,
    field,
  }))
})
</script>

<template>
  <v-dialog v-model="dialog" max-width="900" persistent scrollable>
    <v-card>
      <v-card-title>Map Form Fields to OpenSPP Fields</v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Map form fields to OpenSPP fields and configure transformers for data format conversion.
        </p>

        <div v-if="mappings.length === 0" class="text-center pa-4">
          <p class="text-body-1 text-medium-emphasis mb-4">No field mappings yet</p>
          <v-btn color="primary" @click="addMapping">Add Mapping</v-btn>
        </div>

        <div v-else>
          <v-card
            v-for="(mapping, index) in mappings"
            :key="index"
            class="mb-4"
            variant="outlined"
          >
            <v-card-text>
              <v-row>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="mapping.formField"
                    :items="formFieldItems"
                    label="Form Field"
                    required
                    clearable
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="mapping.opensppField"
                    :items="opensppFieldItems"
                    label="OpenSPP Field"
                    required
                    clearable
                    @update:model-value="updateTransformerOptions(index, $event)"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="mapping.transformer.type"
                    :items="[
                      { title: 'Text', value: 'text' },
                      { title: 'Date', value: 'date' },
                      { title: 'Relation', value: 'relation' },
                    ]"
                    label="Transformer Type"
                    required
                  />
                </v-col>
              </v-row>

              <!-- Date Transformer Options -->
              <v-row v-if="mapping.transformer.type === 'date'">
                <v-col cols="12" md="6">
                  <v-select
                    v-model="mapping.transformer.options!.inputFormat"
                    :items="[
                      { title: 'Auto-detect', value: 'auto' },
                      { title: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
                      { title: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
                      { title: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
                    ]"
                    label="Input Format"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="mapping.transformer.options!.outputFormat"
                    :items="[
                      { title: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
                      { title: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
                      { title: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
                    ]"
                    label="Output Format"
                  />
                </v-col>
              </v-row>

              <!-- Relation Transformer Options -->
              <v-row v-if="mapping.transformer.type === 'relation'">
                <v-col cols="12">
                  <v-select
                    v-model="mapping.transformer.options!.relationOutputFormat"
                    :items="[
                      { title: '[id, label]', value: '[id,label]' },
                      { title: 'ID only', value: 'id' },
                      { title: 'Label only', value: 'label' },
                    ]"
                    label="Output Format"
                    hint="Format used when sending to OpenSPP"
                    persistent-hint
                  />
                </v-col>
                <v-col v-if="getFieldOptions(opensppFieldItems.find(item => item.value === mapping.opensppField)?.field).length > 0" cols="12">
                  <v-alert type="info" variant="tonal" density="compact">
                    <strong>Available options:</strong>
                    <ul class="mt-2 mb-0">
                      <li v-for="opt in getFieldOptions(opensppFieldItems.find(item => item.value === mapping.opensppField)?.field)" :key="String(opt.id)">
                        [{{ opt.id }}, "{{ opt.label }}"]
                      </li>
                    </ul>
                  </v-alert>
                </v-col>
              </v-row>

              <v-btn
                color="error"
                variant="text"
                size="small"
                prepend-icon="mdi-delete"
                @click="removeMapping(index)"
              >
                Remove Mapping
              </v-btn>
            </v-card-text>
          </v-card>

          <v-btn color="primary" variant="outlined" prepend-icon="mdi-plus" @click="addMapping">
            Add Mapping
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="mappings.length === 0"
          @click="saveMappings"
        >
          Save Mappings
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
