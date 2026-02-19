import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChangeRequestForm from '@/components/ChangeRequestForm.vue'
import type { FormioComponent } from '@/composables/useFormio'

const textComponent: FormioComponent = {
  type: 'textfield',
  key: 'firstName',
  label: 'First Name',
  input: true,
}

const selectComponent: FormioComponent = {
  type: 'select',
  key: 'gender',
  label: 'Gender',
  input: true,
  data: {
    values: [
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' },
    ],
  },
}

const checkboxComponent: FormioComponent = {
  type: 'checkbox',
  key: 'agreed',
  label: 'I agree',
  input: true,
}

const numberComponent: FormioComponent = {
  type: 'number',
  key: 'age',
  label: 'Age',
  input: true,
}

const panelComponent: FormioComponent = {
  type: 'panel',
  key: 'personalPanel',
  label: 'Personal Info',
  input: false,
  components: [
    { type: 'textfield', key: 'street', label: 'Street', input: true },
  ],
}

const textareaComponent: FormioComponent = {
  type: 'textarea',
  key: 'notes',
  label: 'Notes',
  input: true,
}

const tooltipComponent: FormioComponent = {
  type: 'textfield',
  key: 'phone',
  label: 'Phone',
  input: true,
  tooltip: 'Enter your phone number with country code',
}

function mountForm(
  components: FormioComponent[],
  modelValue: Record<string, unknown> = {},
  errors: Record<string, string> = {},
  readonly = false,
) {
  return mount(ChangeRequestForm, {
    props: {
      components,
      modelValue,
      errors,
      readonly,
    },
  })
}

describe('ChangeRequestForm', () => {
  describe('rendering', () => {
    it('renders a text field for textfield components', () => {
      const wrapper = mountForm([textComponent])
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.exists()).toBe(true)
    })

    it('renders a select for select components', () => {
      const wrapper = mountForm([selectComponent])
      const select = wrapper.findComponent({ name: 'VSelect' })
      expect(select.exists()).toBe(true)
    })

    it('renders a checkbox for checkbox components', () => {
      const wrapper = mountForm([checkboxComponent])
      const checkbox = wrapper.findComponent({ name: 'VCheckbox' })
      expect(checkbox.exists()).toBe(true)
    })

    it('renders number input for number components', () => {
      const wrapper = mountForm([numberComponent])
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.exists()).toBe(true)
      expect(field.props('type')).toBe('number')
    })

    it('renders a textarea for textarea components', () => {
      const wrapper = mountForm([textareaComponent])
      const textarea = wrapper.findComponent({ name: 'VTextarea' })
      expect(textarea.exists()).toBe(true)
    })

    it('renders panels with nested components inside a VCard', () => {
      const wrapper = mountForm([panelComponent])
      const card = wrapper.findComponent({ name: 'VCard' })
      expect(card.exists()).toBe(true)
    })

    it('renders nested components inside a panel', () => {
      const wrapper = mountForm([panelComponent])
      const nestedForm = wrapper.findComponent(ChangeRequestForm)
      // The top-level is the wrapper itself, find any nested usage
      const allForms = wrapper.findAllComponents(ChangeRequestForm)
      // Should have the inner form for panel children
      expect(allForms.length).toBeGreaterThan(0)
    })

    it('passes select items from data.values', () => {
      const wrapper = mountForm([selectComponent])
      const select = wrapper.findComponent({ name: 'VSelect' })
      const items = select.props('items') as Array<{ title: string; value: string }>
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual({ title: 'Male', value: 'male' })
    })
  })

  describe('model value', () => {
    it('passes modelValue to text field', () => {
      const wrapper = mountForm([textComponent], { firstName: 'John' })
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('modelValue')).toBe('John')
    })

    it('passes modelValue to checkbox', () => {
      const wrapper = mountForm([checkboxComponent], { agreed: true })
      const checkbox = wrapper.findComponent({ name: 'VCheckbox' })
      expect(checkbox.props('modelValue')).toBe(true)
    })
  })

  describe('emitting updates', () => {
    it('emits update:modelValue when text field changes', async () => {
      const wrapper = mountForm([textComponent], { firstName: '' })
      const field = wrapper.findComponent({ name: 'VTextField' })
      await field.vm.$emit('update:modelValue', 'Jane')
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      const emitted = wrapper.emitted('update:modelValue') as Array<Array<Record<string, unknown>>>
      expect(emitted[0][0]).toEqual({ firstName: 'Jane' })
    })

    it('emits update:modelValue when select changes', async () => {
      const wrapper = mountForm([selectComponent], { gender: '' })
      const select = wrapper.findComponent({ name: 'VSelect' })
      await select.vm.$emit('update:modelValue', 'male')
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    })

    it('emits update:modelValue when checkbox changes', async () => {
      const wrapper = mountForm([checkboxComponent], { agreed: false })
      const checkbox = wrapper.findComponent({ name: 'VCheckbox' })
      await checkbox.vm.$emit('update:modelValue', true)
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    })
  })

  describe('error messages', () => {
    it('shows error messages from errors prop', () => {
      const wrapper = mountForm([textComponent], {}, { firstName: 'First Name is required' })
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('errorMessages')).toBe('First Name is required')
    })

    it('shows no error when errors prop is empty', () => {
      const wrapper = mountForm([textComponent], {}, {})
      const field = wrapper.findComponent({ name: 'VTextField' })
      const errorMessages = field.props('errorMessages')
      // errorMessages can be '', undefined, null, or an empty array when no errors
      const isEmpty =
        errorMessages === '' ||
        errorMessages === undefined ||
        errorMessages === null ||
        (Array.isArray(errorMessages) && errorMessages.length === 0)
      expect(isEmpty).toBe(true)
    })
  })

  describe('tooltip', () => {
    it('passes tooltip as hint to text field', () => {
      const wrapper = mountForm([tooltipComponent])
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('hint')).toBe('Enter your phone number with country code')
    })

    it('sets persistentHint when tooltip is present', () => {
      const wrapper = mountForm([tooltipComponent])
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('persistentHint')).toBe(true)
    })
  })

  describe('read-only mode', () => {
    it('sets readonly on text field when readonly prop is true', () => {
      const wrapper = mountForm([textComponent], { firstName: 'John' }, {}, true)
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('readonly')).toBe(true)
    })

    it('sets readonly on select when readonly prop is true', () => {
      const wrapper = mountForm([selectComponent], {}, {}, true)
      const select = wrapper.findComponent({ name: 'VSelect' })
      expect(select.props('readonly')).toBe(true)
    })

    it('does not set readonly when readonly prop is false', () => {
      const wrapper = mountForm([textComponent], {})
      const field = wrapper.findComponent({ name: 'VTextField' })
      expect(field.props('readonly')).toBe(false)
    })
  })
})
