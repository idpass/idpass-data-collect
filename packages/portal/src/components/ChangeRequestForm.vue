<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { FormioComponent } from '@/composables/useFormio'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    components: FormioComponent[]
    modelValue: Record<string, unknown>
    errors: Record<string, string>
    readonly?: boolean
  }>(),
  {
    readonly: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

function updateField(key: string, value: unknown): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function getStringValue(key: string): string {
  const val = props.modelValue[key]
  return val !== undefined && val !== null ? String(val) : ''
}

function getBooleanValue(key: string): boolean {
  return Boolean(props.modelValue[key])
}

function getNumberValue(key: string): number | null {
  const val = props.modelValue[key]
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  return isNaN(num) ? null : num
}

function getSelectItems(component: FormioComponent): Array<{ title: string; value: string }> {
  return (component.data?.values ?? []).map((item) => ({
    title: item.label,
    value: item.value,
  }))
}

function getAutocompleteAttribute(key: string): string | undefined {
  const lowerKey = key.toLowerCase()
  if (lowerKey.includes('email')) return 'email'
  if (lowerKey.includes('phone') || lowerKey.includes('tel')) return 'tel'
  if (lowerKey === 'first_name' || lowerKey === 'firstname' || lowerKey === 'given_name' || lowerKey === 'givenname') return 'given-name'
  if (lowerKey === 'last_name' || lowerKey === 'lastname' || lowerKey === 'family_name' || lowerKey === 'familyname') return 'family-name'
  if (lowerKey === 'name' || lowerKey === 'full_name' || lowerKey === 'fullname') return 'name'
  return undefined
}
</script>

<template>
  <div class="change-request-form">
    <template v-for="component in components" :key="component.key">
      <!-- Panel -->
      <v-card
        v-if="component.type === 'panel'"
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ component.label }}
        </v-card-title>
        <v-card-text class="pt-0">
          <ChangeRequestForm
            v-if="component.components"
            :components="component.components"
            :model-value="modelValue"
            :errors="errors"
            :readonly="readonly"
            @update:model-value="(val) => $emit('update:modelValue', val)"
          />
        </v-card-text>
      </v-card>

      <!-- Fieldset -->
      <v-card
        v-else-if="component.type === 'fieldset'"
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ component.label }}
        </v-card-title>
        <v-card-text class="pt-0">
          <ChangeRequestForm
            v-if="component.components"
            :components="component.components"
            :model-value="modelValue"
            :errors="errors"
            :readonly="readonly"
            @update:model-value="(val) => $emit('update:modelValue', val)"
          />
        </v-card-text>
      </v-card>

      <!-- Text field -->
      <v-text-field
        v-else-if="component.type === 'textfield'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        :autocomplete="getAutocompleteAttribute(component.key)"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Email field -->
      <v-text-field
        v-else-if="component.type === 'email'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        type="email"
        autocomplete="email"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- URL field -->
      <v-text-field
        v-else-if="component.type === 'url'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        type="url"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Number field -->
      <v-text-field
        v-else-if="component.type === 'number'"
        :model-value="getNumberValue(component.key) ?? ''"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        type="number"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val === '' ? null : Number(val))"
      />

      <!-- Datetime / date field -->
      <v-text-field
        v-else-if="component.type === 'datetime'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        type="date"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Phone number field -->
      <v-text-field
        v-else-if="component.type === 'phoneNumber'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        type="tel"
        autocomplete="tel"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Select field -->
      <v-select
        v-else-if="component.type === 'select'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :items="getSelectItems(component)"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        item-title="title"
        item-value="value"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Checkbox field -->
      <v-checkbox
        v-else-if="component.type === 'checkbox'"
        :model-value="getBooleanValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        color="primary"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Textarea field -->
      <v-textarea
        v-else-if="component.type === 'textarea'"
        :model-value="getStringValue(component.key)"
        :label="component.label"
        :error-messages="errors[component.key]"
        :readonly="readonly"
        :hint="component.tooltip"
        :persistent-hint="!!component.tooltip"
        :required="component.validate?.required"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        @update:model-value="(val) => updateField(component.key, val)"
      />

      <!-- Datagrid (not yet supported) -->
      <v-alert
        v-else-if="component.type === 'datagrid' || component.type === 'editgrid'"
        type="info"
        variant="tonal"
        rounded="lg"
        class="mb-4"
      >
        <p class="text-subtitle-2 font-weight-medium mb-1">
          {{ component.label }}
        </p>
        <p class="text-body-2 mb-0">
          {{ t('form.datagridPlaceholder') }}
        </p>
      </v-alert>
    </template>
  </div>
</template>
