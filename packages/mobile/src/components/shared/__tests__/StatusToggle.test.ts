import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusToggle from '../StatusToggle.vue'

describe('StatusToggle', () => {
  it('renders the current status pill', () => {
    const wrapper = mount(StatusToggle, {
      props: { status: 'present' },
    })
    expect(wrapper.find('.status-toggle__pill').exists()).toBe(true)
    expect(wrapper.text()).toContain('Present')
  })

  it('opens segmented control when pill is clicked', async () => {
    const wrapper = mount(StatusToggle, {
      props: { status: 'present' },
    })
    await wrapper.find('.status-toggle__pill').trigger('click')
    expect(wrapper.find('.status-toggle__segmented').exists()).toBe(true)
    expect(wrapper.find('.status-toggle__pill').exists()).toBe(false)
  })

  it('shows all four status options when open', async () => {
    const wrapper = mount(StatusToggle, {
      props: { status: 'present' },
    })
    await wrapper.find('.status-toggle__pill').trigger('click')
    const options = wrapper.findAll('.status-toggle__option')
    expect(options).toHaveLength(4)
  })

  it('emits change event with selected status value', async () => {
    const wrapper = mount(StatusToggle, {
      props: { status: 'present' },
    })
    await wrapper.find('.status-toggle__pill').trigger('click')
    const options = wrapper.findAll('.status-toggle__option')
    const absentOption = options.find((o) => o.text() === 'Absent')!
    await absentOption.trigger('click')
    expect(wrapper.emitted('change')).toBeTruthy()
    expect(wrapper.emitted('change')![0]).toEqual(['absent'])
  })

  it('closes segmented control after selection', async () => {
    const wrapper = mount(StatusToggle, {
      props: { status: 'present' },
    })
    await wrapper.find('.status-toggle__pill').trigger('click')
    const options = wrapper.findAll('.status-toggle__option')
    await options[0].trigger('click')
    expect(wrapper.find('.status-toggle__segmented').exists()).toBe(false)
    expect(wrapper.find('.status-toggle__pill').exists()).toBe(true)
  })

  it('renders absent status pill with red color', () => {
    const wrapper = mount(StatusToggle, { props: { status: 'absent' } })
    const pill = wrapper.find('.status-toggle__pill')
    // jsdom normalizes hex colors to rgb()
    expect(pill.attributes('style')).toContain('rgb(239, 68, 68)')
  })

  it('renders excused status pill with blue color', () => {
    const wrapper = mount(StatusToggle, { props: { status: 'excused' } })
    const pill = wrapper.find('.status-toggle__pill')
    expect(pill.attributes('style')).toContain('rgb(37, 99, 235)')
  })

  it('renders late status pill with amber color', () => {
    const wrapper = mount(StatusToggle, { props: { status: 'late' } })
    const pill = wrapper.find('.status-toggle__pill')
    expect(pill.attributes('style')).toContain('rgb(245, 158, 11)')
  })

  it('renders present status pill with green color', () => {
    const wrapper = mount(StatusToggle, { props: { status: 'present' } })
    const pill = wrapper.find('.status-toggle__pill')
    expect(pill.attributes('style')).toContain('rgb(34, 197, 94)')
  })

  it('marks the currently selected option in the segmented control', async () => {
    const wrapper = mount(StatusToggle, { props: { status: 'absent' } })
    await wrapper.find('.status-toggle__pill').trigger('click')
    const selectedOption = wrapper.find('.status-toggle__option--selected')
    expect(selectedOption.text()).toBe('Absent')
  })
})
