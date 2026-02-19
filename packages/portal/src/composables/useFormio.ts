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

import { ref, computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

export interface FormioComponent {
  type: string
  key: string
  label: string
  input?: boolean
  tooltip?: string
  validate?: {
    required?: boolean
    pattern?: string
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
  }
  data?: {
    values?: Array<{ label: string; value: string }>
  }
  components?: FormioComponent[]
  [key: string]: unknown
}

export function useFormio(schema: Ref<{ components: FormioComponent[] } | null>) {
  const { t } = useI18n()

  const formData = ref<Record<string, unknown>>({})
  const errors = ref<Record<string, string>>({})
  const isDirty = ref(false)
  const isValid = computed(() => Object.keys(errors.value).length === 0)

  // Flatten components into a list of input fields (skip panels, etc.)
  const inputComponents = computed<FormioComponent[]>(() => {
    if (!schema.value) return []
    return flattenComponents(schema.value.components)
  })

  function flattenComponents(components: FormioComponent[]): FormioComponent[] {
    const result: FormioComponent[] = []
    for (const comp of components) {
      if (comp.components && (comp.type === 'panel' || comp.type === 'fieldset')) {
        result.push(...flattenComponents(comp.components))
      } else if (comp.input !== false) {
        result.push(comp)
      }
    }
    return result
  }

  // Set a field value
  function setFieldValue(key: string, value: unknown): void {
    formData.value = { ...formData.value, [key]: value }
    isDirty.value = true
    validateField(key)
  }

  // Validate a single field
  function validateField(key: string): string | null {
    const component = inputComponents.value.find((c) => c.key === key)
    if (!component) return null

    const value = formData.value[key]
    const validate = component.validate
    const label = component.label

    if (validate?.required && (value === undefined || value === null || value === '')) {
      const msg = t('validation.required', { field: label })
      errors.value = { ...errors.value, [key]: msg }
      return msg
    }

    if (typeof value === 'string' && validate?.minLength && value.length < validate.minLength) {
      const msg = t('validation.minLength', { field: label, min: validate.minLength })
      errors.value = { ...errors.value, [key]: msg }
      return msg
    }

    if (typeof value === 'string' && validate?.maxLength && value.length > validate.maxLength) {
      const msg = t('validation.maxLength', { field: label, max: validate.maxLength })
      errors.value = { ...errors.value, [key]: msg }
      return msg
    }

    if (typeof value === 'string' && validate?.pattern) {
      try {
        const regex = new RegExp(validate.pattern)
        if (!regex.test(value)) {
          const msg = t('validation.pattern', { field: label })
          errors.value = { ...errors.value, [key]: msg }
          return msg
        }
      } catch {
        // Invalid regex pattern — skip validation for this rule
      }
    }

    if (typeof value === 'number') {
      if (validate?.min !== undefined && value < validate.min) {
        const msg = t('validation.min', { field: label, min: validate.min })
        errors.value = { ...errors.value, [key]: msg }
        return msg
      }
      if (validate?.max !== undefined && value > validate.max) {
        const msg = t('validation.max', { field: label, max: validate.max })
        errors.value = { ...errors.value, [key]: msg }
        return msg
      }
    }

    // Remove error if valid
    const newErrors = { ...errors.value }
    delete newErrors[key]
    errors.value = newErrors
    return null
  }

  // Validate all fields
  function validateAll(): boolean {
    for (const comp of inputComponents.value) {
      validateField(comp.key)
    }
    return isValid.value
  }

  // Initialize form data (e.g., from a draft or existing submission)
  function initializeFormData(data: Record<string, unknown>): void {
    formData.value = { ...data }
    isDirty.value = false
    errors.value = {}
  }

  // Reset form
  function resetForm(): void {
    formData.value = {}
    errors.value = {}
    isDirty.value = false
  }

  return {
    formData,
    errors,
    isDirty,
    isValid,
    inputComponents,
    setFieldValue,
    validateField,
    validateAll,
    initializeFormData,
    resetForm,
  }
}
