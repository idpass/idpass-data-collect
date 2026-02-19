import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressOverlay from '../ProgressOverlay.vue'

describe('ProgressOverlay', () => {
  it('is hidden when visible is false', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: false, current: 0, total: 10 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('.progress-overlay').exists()).toBe(false)
  })

  it('is shown when visible is true', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 0, total: 10 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('.progress-overlay').exists()).toBe(true)
  })

  it('shows the N/M counter text', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 5, total: 20 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.text()).toContain('5 / 20')
  })

  it('shows the label when provided', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 3, total: 10, label: 'Processing records...' },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.text()).toContain('Processing records...')
  })

  it('does not show label element when label is not provided', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 3, total: 10 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('.progress-overlay__label').exists()).toBe(false)
  })

  it('sets progress bar width based on current/total', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 5, total: 10 },
      global: { stubs: { teleport: true } },
    })
    const bar = wrapper.find('.progress-overlay__bar')
    expect(bar.attributes('style')).toContain('width: 50%')
  })

  it('shows crash-safe hint text', () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 1, total: 5 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.text()).toContain('Crash-safe: progress is saved')
  })

  it('updates bar width when props change', async () => {
    const wrapper = mount(ProgressOverlay, {
      props: { visible: true, current: 2, total: 10 },
      global: { stubs: { teleport: true } },
    })
    expect(wrapper.find('.progress-overlay__bar').attributes('style')).toContain('width: 20%')

    await wrapper.setProps({ current: 7 })
    expect(wrapper.find('.progress-overlay__bar').attributes('style')).toContain('width: 70%')
  })
})
