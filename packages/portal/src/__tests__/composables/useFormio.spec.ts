import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

// Mock vue-i18n so useFormio can call useI18n() outside a component context
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      // Produce human-readable messages for test assertions
      if (key === 'validation.required' && params) {
        return `${params.field} is required`
      }
      if (key === 'validation.minLength' && params) {
        return `${params.field} must be at least ${params.min} characters`
      }
      if (key === 'validation.maxLength' && params) {
        return `${params.field} must be at most ${params.max} characters`
      }
      if (key === 'validation.pattern' && params) {
        return `${params.field} format is invalid`
      }
      if (key === 'validation.min' && params) {
        return `${params.field} must be at least ${params.min}`
      }
      if (key === 'validation.max' && params) {
        return `${params.field} must be at most ${params.max}`
      }
      return key
    },
  }),
}))

import { useFormio, type FormioComponent } from '@/composables/useFormio'

function makeSchema(components: FormioComponent[]) {
  return ref<{ components: FormioComponent[] } | null>({ components })
}

const makeTextField = (overrides?: Partial<FormioComponent>): FormioComponent => ({
  type: 'textfield',
  key: 'firstName',
  label: 'First Name',
  input: true,
  ...overrides,
})

const makeRequiredField = (): FormioComponent =>
  makeTextField({
    validate: { required: true },
  })

describe('useFormio', () => {
  describe('initial state', () => {
    it('has empty formData', () => {
      const schema = makeSchema([makeTextField()])
      const { formData } = useFormio(schema)
      expect(formData.value).toEqual({})
    })

    it('has no errors', () => {
      const schema = makeSchema([makeTextField()])
      const { errors } = useFormio(schema)
      expect(errors.value).toEqual({})
    })

    it('is not dirty', () => {
      const schema = makeSchema([makeTextField()])
      const { isDirty } = useFormio(schema)
      expect(isDirty.value).toBe(false)
    })

    it('is valid when no errors', () => {
      const schema = makeSchema([makeTextField()])
      const { isValid } = useFormio(schema)
      expect(isValid.value).toBe(true)
    })
  })

  describe('setFieldValue', () => {
    it('updates formData', () => {
      const schema = makeSchema([makeTextField()])
      const { formData, setFieldValue } = useFormio(schema)
      setFieldValue('firstName', 'John')
      expect(formData.value.firstName).toBe('John')
    })

    it('marks isDirty as true', () => {
      const schema = makeSchema([makeTextField()])
      const { isDirty, setFieldValue } = useFormio(schema)
      setFieldValue('firstName', 'John')
      expect(isDirty.value).toBe(true)
    })

    it('triggers validation on the field', () => {
      const schema = makeSchema([makeRequiredField()])
      const { errors, setFieldValue } = useFormio(schema)
      setFieldValue('firstName', '')
      expect(errors.value.firstName).toBeDefined()
    })
  })

  describe('validateField', () => {
    it('catches missing required fields', () => {
      const schema = makeSchema([makeRequiredField()])
      const { validateField } = useFormio(schema)
      const msg = validateField('firstName')
      expect(msg).toBe('First Name is required')
    })

    it('catches undefined required fields', () => {
      const schema = makeSchema([makeRequiredField()])
      const { validateField } = useFormio(schema)
      const msg = validateField('firstName')
      expect(msg).toContain('required')
    })

    it('catches minLength violations', () => {
      const schema = makeSchema([
        makeTextField({ validate: { minLength: 5 } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'Jo' }
      const msg = validateField('firstName')
      expect(msg).toContain('at least 5 characters')
    })

    it('catches maxLength violations', () => {
      const schema = makeSchema([
        makeTextField({ validate: { maxLength: 3 } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'Jonathan' }
      const msg = validateField('firstName')
      expect(msg).toContain('at most 3 characters')
    })

    it('catches pattern violations', () => {
      const schema = makeSchema([
        makeTextField({ validate: { pattern: '^[0-9]+$' } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'abc' }
      const msg = validateField('firstName')
      expect(msg).toContain('format is invalid')
    })

    it('catches min violations for numbers', () => {
      const schema = makeSchema([
        {
          type: 'number',
          key: 'age',
          label: 'Age',
          input: true,
          validate: { min: 18 },
        },
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { age: 10 }
      const msg = validateField('age')
      expect(msg).toContain('at least 18')
    })

    it('catches max violations for numbers', () => {
      const schema = makeSchema([
        {
          type: 'number',
          key: 'age',
          label: 'Age',
          input: true,
          validate: { max: 120 },
        },
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { age: 200 }
      const msg = validateField('age')
      expect(msg).toContain('at most 120')
    })

    it('removes error when field becomes valid', () => {
      const schema = makeSchema([makeRequiredField()])
      const { errors, formData, validateField } = useFormio(schema)
      // First make it invalid
      validateField('firstName')
      expect(errors.value.firstName).toBeDefined()
      // Then make it valid
      formData.value = { firstName: 'John' }
      validateField('firstName')
      expect(errors.value.firstName).toBeUndefined()
    })

    it('returns null for unknown field keys', () => {
      const schema = makeSchema([makeTextField()])
      const { validateField } = useFormio(schema)
      const msg = validateField('unknownField')
      expect(msg).toBeNull()
    })

    it('skips pattern validation when regex is invalid (ReDoS protection)', () => {
      const schema = makeSchema([
        makeTextField({ validate: { pattern: '((' } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'test' }
      const msg = validateField('firstName')
      // Invalid pattern should not produce an error
      expect(msg).toBeNull()
    })
  })

  describe('validateAll', () => {
    it('validates all required fields and returns false when invalid', () => {
      const schema = makeSchema([
        makeRequiredField(),
        makeTextField({ key: 'lastName', label: 'Last Name', validate: { required: true } }),
      ])
      const { errors, validateAll } = useFormio(schema)
      const valid = validateAll()
      expect(valid).toBe(false)
      expect(errors.value.firstName).toBeDefined()
      expect(errors.value.lastName).toBeDefined()
    })

    it('returns true when all fields are valid', () => {
      const schema = makeSchema([makeRequiredField()])
      const { formData, validateAll } = useFormio(schema)
      formData.value = { firstName: 'John' }
      const valid = validateAll()
      expect(valid).toBe(true)
    })
  })

  describe('initializeFormData', () => {
    it('sets form data from provided object', () => {
      const schema = makeSchema([makeTextField()])
      const { formData, initializeFormData } = useFormio(schema)
      initializeFormData({ firstName: 'Jane' })
      expect(formData.value.firstName).toBe('Jane')
    })

    it('resets isDirty to false', () => {
      const schema = makeSchema([makeTextField()])
      const { isDirty, setFieldValue, initializeFormData } = useFormio(schema)
      setFieldValue('firstName', 'temp')
      expect(isDirty.value).toBe(true)
      initializeFormData({ firstName: 'Jane' })
      expect(isDirty.value).toBe(false)
    })

    it('clears any existing errors', () => {
      const schema = makeSchema([makeRequiredField()])
      const { errors, validateField, initializeFormData } = useFormio(schema)
      validateField('firstName')
      expect(errors.value.firstName).toBeDefined()
      initializeFormData({ firstName: 'Jane' })
      expect(errors.value).toEqual({})
    })
  })

  describe('resetForm', () => {
    it('clears formData', () => {
      const schema = makeSchema([makeTextField()])
      const { formData, setFieldValue, resetForm } = useFormio(schema)
      setFieldValue('firstName', 'John')
      resetForm()
      expect(formData.value).toEqual({})
    })

    it('clears errors', () => {
      const schema = makeSchema([makeRequiredField()])
      const { errors, validateField, resetForm } = useFormio(schema)
      validateField('firstName')
      resetForm()
      expect(errors.value).toEqual({})
    })

    it('resets isDirty to false', () => {
      const schema = makeSchema([makeTextField()])
      const { isDirty, setFieldValue, resetForm } = useFormio(schema)
      setFieldValue('firstName', 'John')
      expect(isDirty.value).toBe(true)
      resetForm()
      expect(isDirty.value).toBe(false)
    })
  })

  describe('inputComponents', () => {
    it('flattens panel components into a flat list', () => {
      const schema = makeSchema([
        {
          type: 'panel',
          key: 'personalPanel',
          label: 'Personal Info',
          input: false,
          components: [
            makeTextField({ key: 'firstName', label: 'First Name' }),
            makeTextField({ key: 'lastName', label: 'Last Name' }),
          ],
        },
      ])
      const { inputComponents } = useFormio(schema)
      expect(inputComponents.value).toHaveLength(2)
      expect(inputComponents.value[0].key).toBe('firstName')
      expect(inputComponents.value[1].key).toBe('lastName')
    })

    it('flattens fieldset components into a flat list', () => {
      const schema = makeSchema([
        {
          type: 'fieldset',
          key: 'addressFieldset',
          label: 'Address',
          input: false,
          components: [makeTextField({ key: 'street', label: 'Street' })],
        },
      ])
      const { inputComponents } = useFormio(schema)
      expect(inputComponents.value).toHaveLength(1)
      expect(inputComponents.value[0].key).toBe('street')
    })

    it('includes regular input fields directly', () => {
      const schema = makeSchema([makeTextField()])
      const { inputComponents } = useFormio(schema)
      expect(inputComponents.value).toHaveLength(1)
    })

    it('returns empty array when schema is null', () => {
      const schema = ref<{ components: FormioComponent[] } | null>(null)
      const { inputComponents } = useFormio(schema)
      expect(inputComponents.value).toEqual([])
    })

    it('excludes non-input components (input: false)', () => {
      const schema = makeSchema([
        { type: 'content', key: 'info', label: 'Info Text', input: false },
        makeTextField(),
      ])
      const { inputComponents } = useFormio(schema)
      expect(inputComponents.value).toHaveLength(1)
      expect(inputComponents.value[0].key).toBe('firstName')
    })
  })

  describe('i18n integration', () => {
    it('uses i18n t function for required validation messages', () => {
      const schema = makeSchema([makeRequiredField()])
      const { validateField } = useFormio(schema)
      const msg = validateField('firstName')
      expect(msg).toBe('First Name is required')
    })

    it('uses i18n t function for min length validation messages', () => {
      const schema = makeSchema([
        makeTextField({ validate: { minLength: 3 } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'Jo' }
      const msg = validateField('firstName')
      expect(msg).toBe('First Name must be at least 3 characters')
    })

    it('uses i18n t function for max length validation messages', () => {
      const schema = makeSchema([
        makeTextField({ validate: { maxLength: 5 } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'Jonathan' }
      const msg = validateField('firstName')
      expect(msg).toBe('First Name must be at most 5 characters')
    })

    it('uses i18n t function for pattern validation messages', () => {
      const schema = makeSchema([
        makeTextField({ validate: { pattern: '^[0-9]+$' } }),
      ])
      const { formData, validateField } = useFormio(schema)
      formData.value = { firstName: 'abc' }
      const msg = validateField('firstName')
      expect(msg).toBe('First Name format is invalid')
    })
  })
})
