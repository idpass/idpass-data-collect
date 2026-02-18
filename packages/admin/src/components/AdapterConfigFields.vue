<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * Field definition for adapter configuration.
 * Mirrors the structure from adapter-configs.ts in datacollect package.
 */
interface AdapterFieldDefinition {
  name: string
  label: string
  type: 'text' | 'password' | 'number' | 'url' | 'select'
  required: boolean
  placeholder?: string
  helpText?: string
  options?: { value: string; label: string }[]
  default?: string | number
}

/**
 * Adapter configuration schema.
 */
interface AdapterConfigSchema {
  adapterType: string
  displayName: string
  description?: string
  fields: AdapterFieldDefinition[]
}

/**
 * Registry of adapter configurations.
 * This mirrors the ADAPTER_CONFIGS from datacollect package.
 */
const ADAPTER_CONFIGS: Record<string, AdapterConfigSchema> = {
  'openspp-v1-adapter': {
    adapterType: 'openspp-v1-adapter',
    displayName: 'OpenSPP V1 (Odoo 17.0)',
    description: 'Connect to OpenSPP using the JSON-RPC/Odoo API',
    fields: [
      {
        name: 'database',
        label: 'Database Name',
        type: 'text',
        required: true,
        placeholder: 'openspp_db',
        helpText: 'The Odoo database name to connect to',
      },
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'admin',
        helpText: 'Odoo user login',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        helpText: 'Odoo user password',
      },
      {
        name: 'registrarGroup',
        label: 'Registrar Group',
        type: 'text',
        required: false,
        helpText: 'Optional Odoo group name required for sync permissions',
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: 'number',
        required: false,
        default: 50,
        helpText: 'Number of entities to process per batch (default: 50)',
      },
      {
        name: 'batchDelayMs',
        label: 'Batch Delay (ms)',
        type: 'number',
        required: false,
        default: 1000,
        helpText: 'Delay between batches in milliseconds (default: 1000)',
      },
      {
        name: 'maxRetries',
        label: 'Max Retries',
        type: 'number',
        required: false,
        default: 2,
        helpText: 'Maximum retry attempts for failed entities (default: 2)',
      },
    ],
  },
  'openspp-adapter': {
    adapterType: 'openspp-adapter',
    displayName: 'OpenSPP V1',
    description: 'Connect to OpenSPP using the JSON-RPC/Odoo API',
    fields: [
      {
        name: 'database',
        label: 'Database Name',
        type: 'text',
        required: true,
        placeholder: 'openspp_db',
        helpText: 'The Odoo database name to connect to',
      },
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'admin',
        helpText: 'Odoo user login',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        helpText: 'Odoo user password',
      },
      {
        name: 'registrarGroup',
        label: 'Registrar Group',
        type: 'text',
        required: false,
        helpText: 'Optional Odoo group name required for sync permissions',
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: 'number',
        required: false,
        default: 50,
        helpText: 'Number of entities to process per batch (default: 50)',
      },
    ],
  },
  'openspp-v2-adapter': {
    adapterType: 'openspp-v2-adapter',
    displayName: 'OpenSPP V2 (Odoo 19.0)',
    description: 'Connect to OpenSPP using the modern REST API with OAuth2 authentication',
    fields: [
      {
        name: 'clientId',
        label: 'OAuth Client ID',
        type: 'text',
        required: true,
        helpText: 'OAuth2 client ID from OpenSPP API Client configuration',
      },
      {
        name: 'clientSecret',
        label: 'OAuth Client Secret',
        type: 'password',
        required: true,
        helpText: 'OAuth2 client secret from OpenSPP API Client configuration',
      },
      {
        name: 'identifierNamespace',
        label: 'Identifier Namespace',
        type: 'text',
        required: true,
        placeholder: 'urn:datacollect:entity',
        helpText: 'URI namespace for external identifiers (e.g., urn:datacollect:entity)',
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: 'number',
        required: false,
        default: 50,
        helpText: 'Number of entities to process per batch (default: 50)',
      },
      {
        name: 'includeStudioExtensions',
        label: 'Include Studio Fields',
        type: 'select',
        required: false,
        options: [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
        default: 'true',
        helpText: 'Whether to include Studio custom fields in sync operations',
      },
      {
        name: 'batchDelayMs',
        label: 'Batch Delay (ms)',
        type: 'number',
        required: false,
        default: 1000,
        helpText: 'Delay between batches in milliseconds (default: 1000)',
      },
      {
        name: 'maxRetries',
        label: 'Max Retries',
        type: 'number',
        required: false,
        default: 2,
        helpText: 'Maximum retry attempts for failed entities (default: 2)',
      },
    ],
  },
  'openfn-adapter': {
    adapterType: 'openfn-adapter',
    displayName: 'OpenFn',
    description: 'Connect to OpenFn for workflow-based data integration',
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'OpenFn API key for authentication',
      },
      {
        name: 'callbackToken',
        label: 'Callback Token',
        type: 'password',
        required: false,
        helpText: 'Optional token for pull callbacks',
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: 'number',
        required: false,
        default: 100,
        helpText: 'Number of entities to process per batch (default: 100)',
      },
    ],
  },
  'mock-sync-server': {
    adapterType: 'mock-sync-server',
    displayName: 'Mock Sync Server',
    description: 'Mock adapter for testing and development',
    fields: [],
  },
}

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

// Get the input type for v-text-field
const getInputType = (field: AdapterFieldDefinition): string => {
  switch (field.type) {
    case 'password':
      return 'password'
    case 'number':
      return 'number'
    case 'url':
      return 'url'
    default:
      return 'text'
  }
}

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
