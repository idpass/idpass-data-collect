import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from '@/components/StatusBadge.vue'
import type { RequestStatus } from '@/types'

function mountBadge(status: RequestStatus) {
  return mount(StatusBadge, {
    props: { status },
  })
}

describe('StatusBadge', () => {
  describe('rendering for each status', () => {
    it('renders for "draft" status', () => {
      const wrapper = mountBadge('draft')
      expect(wrapper.exists()).toBe(true)
    })

    it('renders for "pending" status', () => {
      const wrapper = mountBadge('pending')
      expect(wrapper.exists()).toBe(true)
    })

    it('renders for "revision" status', () => {
      const wrapper = mountBadge('revision')
      expect(wrapper.exists()).toBe(true)
    })

    it('renders for "approved" status', () => {
      const wrapper = mountBadge('approved')
      expect(wrapper.exists()).toBe(true)
    })

    it('renders for "rejected" status', () => {
      const wrapper = mountBadge('rejected')
      expect(wrapper.exists()).toBe(true)
    })

    it('renders for "applied" status', () => {
      const wrapper = mountBadge('applied')
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('data-testid attributes', () => {
    it('sets data-testid to "status-badge-draft" for draft', () => {
      const wrapper = mountBadge('draft')
      const chip = wrapper.find('[data-testid="status-badge-draft"]')
      expect(chip.exists()).toBe(true)
    })

    it('sets data-testid to "status-badge-pending" for pending', () => {
      const wrapper = mountBadge('pending')
      const chip = wrapper.find('[data-testid="status-badge-pending"]')
      expect(chip.exists()).toBe(true)
    })

    it('sets data-testid to "status-badge-revision" for revision', () => {
      const wrapper = mountBadge('revision')
      const chip = wrapper.find('[data-testid="status-badge-revision"]')
      expect(chip.exists()).toBe(true)
    })

    it('sets data-testid to "status-badge-approved" for approved', () => {
      const wrapper = mountBadge('approved')
      const chip = wrapper.find('[data-testid="status-badge-approved"]')
      expect(chip.exists()).toBe(true)
    })

    it('sets data-testid to "status-badge-rejected" for rejected', () => {
      const wrapper = mountBadge('rejected')
      const chip = wrapper.find('[data-testid="status-badge-rejected"]')
      expect(chip.exists()).toBe(true)
    })

    it('sets data-testid to "status-badge-applied" for applied', () => {
      const wrapper = mountBadge('applied')
      const chip = wrapper.find('[data-testid="status-badge-applied"]')
      expect(chip.exists()).toBe(true)
    })
  })

  describe('human-readable labels', () => {
    it('shows "Not submitted" for draft', () => {
      const wrapper = mountBadge('draft')
      expect(wrapper.text()).toContain('Not submitted')
    })

    it('shows "Under review" for pending', () => {
      const wrapper = mountBadge('pending')
      expect(wrapper.text()).toContain('Under review')
    })

    it('shows "Action needed" for revision', () => {
      const wrapper = mountBadge('revision')
      expect(wrapper.text()).toContain('Action needed')
    })

    it('shows "Approved" for approved', () => {
      const wrapper = mountBadge('approved')
      expect(wrapper.text()).toContain('Approved')
    })

    it('shows "Not approved" for rejected', () => {
      const wrapper = mountBadge('rejected')
      expect(wrapper.text()).toContain('Not approved')
    })

    it('shows "Complete" for applied', () => {
      const wrapper = mountBadge('applied')
      expect(wrapper.text()).toContain('Complete')
    })
  })

  describe('colors', () => {
    it('uses grey color for draft', () => {
      const wrapper = mountBadge('draft')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('grey')
    })

    it('uses blue color for pending', () => {
      const wrapper = mountBadge('pending')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('blue')
    })

    it('uses orange color for revision', () => {
      const wrapper = mountBadge('revision')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('orange')
    })

    it('uses green color for approved', () => {
      const wrapper = mountBadge('approved')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('green')
    })

    it('uses red color for rejected', () => {
      const wrapper = mountBadge('rejected')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('red')
    })

    it('uses teal color for applied', () => {
      const wrapper = mountBadge('applied')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('color')).toBe('teal')
    })
  })

  describe('VChip component', () => {
    it('renders a VChip component', () => {
      const wrapper = mountBadge('pending')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.exists()).toBe(true)
    })

    it('uses tonal variant', () => {
      const wrapper = mountBadge('pending')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('variant')).toBe('tonal')
    })

    it('uses small size', () => {
      const wrapper = mountBadge('pending')
      const chip = wrapper.findComponent({ name: 'VChip' })
      expect(chip.props('size')).toBe('small')
    })
  })
})
