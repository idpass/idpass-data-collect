import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LocationDisclosure from '../LocationDisclosure.vue'

describe('LocationDisclosure', () => {
  it('renders explanation text when visible', () => {
    const wrapper = mount(LocationDisclosure, {
      props: { visible: true },
    })

    expect(wrapper.text()).toContain('This form captures your GPS location when opened')
    expect(wrapper.text()).toContain('Location Access')
  })

  it('emits acknowledged on button click', async () => {
    const wrapper = mount(LocationDisclosure, {
      props: { visible: true },
    })

    await wrapper.find('.location-disclosure__button').trigger('click')

    expect(wrapper.emitted('acknowledged')).toHaveLength(1)
  })

  it('does not render content when visible is false', () => {
    const wrapper = mount(LocationDisclosure, {
      props: { visible: false },
    })

    expect(wrapper.find('.location-disclosure').exists()).toBe(false)
  })

  it('has correct accessibility attributes when visible', () => {
    const wrapper = mount(LocationDisclosure, {
      props: { visible: true },
    })

    const overlay = wrapper.find('.location-disclosure-overlay')
    expect(overlay.attributes('role')).toBe('dialog')
    expect(overlay.attributes('aria-modal')).toBe('true')
    expect(overlay.attributes('aria-labelledby')).toBe('location-disclosure-title')

    const title = wrapper.find('#location-disclosure-title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Location Access')
  })
})
