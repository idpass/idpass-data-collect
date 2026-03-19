<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ADAPTER_CONFIGS,
  type AdapterFieldDefinition,
} from '@idpass/data-collect-core'

interface Props {
  adapterType: string
  modelValue: Record<string, string | number | boolean>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, string | number | boolean>): void
}>()

// Local state for form values
const localValues = ref<Record<string, string | number | boolean>>({})

// Get the adapter config for the current type
const adapterConfig = computed(() => {
  return ADAPTER_CONFIGS[props.adapterType]
})

// Get fields for the current adapter
const fields = computed(() => {
  return adapterConfig.value?.fields || []
})

// Initialize local values when adapter type changes (not on modelValue changes to avoid loop)
watch(
  () => props.adapterType,
  () => {
    const newValues: Record<string, string | number | boolean> = {}

    // Copy existing values from props
    if (props.modelValue) {
      Object.assign(newValues, props.modelValue)
    }

    // Set defaults for missing fields
    for (const field of fields.value) {
      if (!(field.name in newValues) && field.default !== undefined) {
        newValues[field.name] = field.default
      }
    }

    localValues.value = newValues
  },
  { immediate: true },
)

// Emit changes when local values change
watch(
  localValues,
  (newValues) => {
    emit('update:modelValue', { ...newValues })
  },
  { deep: true },
)

// Get the input type for v-text-field (used only for text/url fallback; password/number/select have dedicated branches)
const getInputType = (field: AdapterFieldDefinition): string =>
  field.type === 'url' ? 'url' : 'text'

// Password visibility toggles
const passwordVisibility = ref<Record<string, boolean>>({})

const togglePasswordVisibility = (fieldName: string) => {
  passwordVisibility.value[fieldName] = !passwordVisibility.value[fieldName]
}

const getPasswordInputType = (fieldName: string): string => {
  return passwordVisibility.value[fieldName] ? 'text' : 'password'
}

const getPasswordIcon = (fieldName: string): string => {
  return passwordVisibility.value[fieldName] ? 'mdi-eye-off' : 'mdi-eye'
}
</script>

<template>
  <div class="adapter-config-fields">
    <v-alert v-if="!adapterConfig" type="info" variant="tonal" density="compact" class="mb-4">
      Select a sync type to configure adapter settings.
    </v-alert>

    <template v-else>
      <p v-if="adapterConfig.description" class="text-body-2 text-medium-emphasis mb-4">
        {{ adapterConfig.description }}
      </p>

      <div v-if="fields.length === 0" class="text-body-2 text-medium-emphasis">
        No additional configuration required for this adapter.
      </div>

      <template v-else>
        <template v-for="field in fields" :key="field.name">
          <!-- Select field -->
          <v-select
            v-if="field.type === 'select'"
            v-model="localValues[field.name]"
            :label="field.label"
            :items="field.options || []"
            item-title="label"
            item-value="value"
            :required="field.required"
            :hint="field.helpText"
            persistent-hint
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <!-- Password field with visibility toggle -->
          <v-text-field
            v-else-if="field.type === 'password'"
            v-model="localValues[field.name]"
            :label="field.label"
            :type="getPasswordInputType(field.name)"
            :placeholder="field.placeholder"
            :required="field.required"
            :hint="field.helpText"
            persistent-hint
            variant="outlined"
            density="compact"
            class="mb-3"
            :append-inner-icon="getPasswordIcon(field.name)"
            @click:append-inner="togglePasswordVisibility(field.name)"
          />

          <!-- Number field -->
          <v-text-field
            v-else-if="field.type === 'number'"
            v-model.number="localValues[field.name]"
            :label="field.label"
            type="number"
            :placeholder="field.placeholder"
            :required="field.required"
            :hint="field.helpText"
            persistent-hint
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <!-- Text/URL field -->
          <v-text-field
            v-else
            v-model="localValues[field.name]"
            :label="field.label"
            :type="getInputType(field)"
            :placeholder="field.placeholder"
            :required="field.required"
            :hint="field.helpText"
            persistent-hint
            variant="outlined"
            density="compact"
            class="mb-3"
          />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.adapter-config-fields {
  margin-top: 16px;
}
</style>
