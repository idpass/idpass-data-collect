import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BalanceIndicator from '../BalanceIndicator.vue'

describe('BalanceIndicator', () => {
  it('renders quantity text with unit of measure', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 2, type: 'quantity', unitOfMeasure: 'baskets' },
    })
    expect(wrapper.text()).toContain('8 baskets / 10 baskets remaining')
  })

  it('renders quantity text without unit of measure', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 3, type: 'quantity' },
    })
    expect(wrapper.text()).toContain('7 / 10 remaining')
  })

  it('renders monetary text with currency symbol', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 100, redeemed: 55, type: 'monetary', currency: '$' },
    })
    expect(wrapper.text()).toContain('$45.00 / $100.00 remaining')
  })

  it('uses dollar sign as default currency', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 50, redeemed: 10, type: 'monetary' },
    })
    expect(wrapper.text()).toContain('$40.00 / $50.00 remaining')
  })

  it('applies green class when more than 50% remaining', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 4, type: 'quantity' },
    })
    expect(wrapper.find('.balance-indicator--green').exists()).toBe(true)
  })

  it('applies yellow class when 25–50% remaining', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 6, type: 'quantity' },
    })
    expect(wrapper.find('.balance-indicator--yellow').exists()).toBe(true)
  })

  it('applies red class when less than 25% remaining', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 9, type: 'quantity' },
    })
    expect(wrapper.find('.balance-indicator--red').exists()).toBe(true)
  })

  it('shows checkmark icon when green (>50% remaining)', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 2, type: 'quantity' },
    })
    expect(wrapper.find('[aria-label="Good balance"]').exists()).toBe(true)
  })

  it('shows warning triangle when yellow (25–50% remaining)', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 6, type: 'quantity' },
    })
    expect(wrapper.find('[aria-label="Low balance warning"]').exists()).toBe(true)
  })

  it('shows exclamation icon when red (<25% remaining)', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 9, type: 'quantity' },
    })
    expect(wrapper.find('[aria-label="Critical balance"]').exists()).toBe(true)
  })

  it('renders progress bar with correct width percentage', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 4, type: 'quantity' },
    })
    const bar = wrapper.find('.balance-indicator__bar')
    // 6/10 = 60% remaining
    expect(bar.attributes('style')).toContain('width: 60%')
  })

  it('caps bar width at 100% when overallocated', () => {
    const wrapper = mount(BalanceIndicator, {
      props: { allocated: 10, redeemed: 0, type: 'quantity' },
    })
    const bar = wrapper.find('.balance-indicator__bar')
    expect(bar.attributes('style')).toContain('width: 100%')
  })
})
