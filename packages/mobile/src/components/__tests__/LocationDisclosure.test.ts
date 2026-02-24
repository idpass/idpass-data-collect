import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LocationDisclosure from '../LocationDisclosure.vue'

describe('LocationDisclosure', () => {
  it('renders explanation text when visible', () => {
    const wrapper = mount(LocationDisclosure, {
      props: { visible: true },
    })

    expect(wrapper.text()).toContain('This form records your GPS location when submitted')
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
})
