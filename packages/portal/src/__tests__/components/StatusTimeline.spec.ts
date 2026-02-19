import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusTimeline from '@/components/StatusTimeline.vue'
import type { RequestHistoryEntry } from '@/types'

const makeHistoryEntry = (overrides?: Partial<RequestHistoryEntry>): RequestHistoryEntry => ({
  status: 'pending',
  timestamp: '2026-01-01T10:00:00Z',
  ...overrides,
})

function mountTimeline(history: RequestHistoryEntry[]) {
  return mount(StatusTimeline, {
    props: { history },
  })
}

describe('StatusTimeline', () => {
  describe('rendering', () => {
    it('renders a timeline element', () => {
      const wrapper = mountTimeline([makeHistoryEntry()])
      const timeline = wrapper.find('[data-testid="status-timeline"]')
      expect(timeline.exists()).toBe(true)
    })

    it('renders a VTimeline component', () => {
      const wrapper = mountTimeline([makeHistoryEntry()])
      const timeline = wrapper.findComponent({ name: 'VTimeline' })
      expect(timeline.exists()).toBe(true)
    })

    it('renders nothing meaningful when history is empty', () => {
      const wrapper = mountTimeline([])
      const items = wrapper.findAll('[data-testid^="timeline-item-"]')
      expect(items).toHaveLength(0)
    })

    it('renders one item per history entry', () => {
      const history = [
        makeHistoryEntry({ status: 'draft', timestamp: '2026-01-01T00:00:00Z' }),
        makeHistoryEntry({ status: 'pending', timestamp: '2026-01-02T00:00:00Z' }),
        makeHistoryEntry({ status: 'approved', timestamp: '2026-01-03T00:00:00Z' }),
      ]
      const wrapper = mountTimeline(history)
      const items = wrapper.findAll('[data-testid^="timeline-item-"]')
      expect(items).toHaveLength(3)
    })

    it('renders a StatusBadge for each entry', () => {
      const history = [makeHistoryEntry({ status: 'pending' }), makeHistoryEntry({ status: 'approved' })]
      const wrapper = mountTimeline(history)
      const badges = wrapper.findAll('[data-testid^="status-badge-"]')
      expect(badges).toHaveLength(2)
    })
  })

  describe('entry content', () => {
    it('shows the formatted date for each entry', () => {
      const history = [makeHistoryEntry({ timestamp: '2026-01-15T00:00:00Z' })]
      const wrapper = mountTimeline(history)
      expect(wrapper.text()).toContain('2026')
    })

    it('shows the message when provided', () => {
      const history = [makeHistoryEntry({ message: 'Please correct your address details.' })]
      const wrapper = mountTimeline(history)
      const messageEl = wrapper.find('[data-testid="timeline-message-0"]')
      expect(messageEl.exists()).toBe(true)
      expect(messageEl.text()).toContain('Please correct your address details.')
    })

    it('does not render message element when message is absent', () => {
      const history = [makeHistoryEntry()]
      const wrapper = mountTimeline(history)
      const messageEl = wrapper.find('[data-testid="timeline-message-0"]')
      expect(messageEl.exists()).toBe(false)
    })

    it('shows the actor when provided', () => {
      const history = [makeHistoryEntry({ actor: 'admin@example.com' })]
      const wrapper = mountTimeline(history)
      const actorEl = wrapper.find('[data-testid="timeline-actor-0"]')
      expect(actorEl.exists()).toBe(true)
      expect(actorEl.text()).toContain('admin@example.com')
    })

    it('does not render actor element when actor is absent', () => {
      const history = [makeHistoryEntry()]
      const wrapper = mountTimeline(history)
      const actorEl = wrapper.find('[data-testid="timeline-actor-0"]')
      expect(actorEl.exists()).toBe(false)
    })
  })

  describe('chronological ordering', () => {
    it('renders entries sorted by timestamp ascending', () => {
      const history = [
        makeHistoryEntry({ status: 'approved', timestamp: '2026-01-03T00:00:00Z' }),
        makeHistoryEntry({ status: 'draft', timestamp: '2026-01-01T00:00:00Z' }),
        makeHistoryEntry({ status: 'pending', timestamp: '2026-01-02T00:00:00Z' }),
      ]
      const wrapper = mountTimeline(history)
      const badges = wrapper.findAll('[data-testid^="status-badge-"]')
      expect(badges[0].attributes('data-testid')).toBe('status-badge-draft')
      expect(badges[1].attributes('data-testid')).toBe('status-badge-pending')
      expect(badges[2].attributes('data-testid')).toBe('status-badge-approved')
    })
  })

  describe('multiple entries', () => {
    it('renders messages only for entries that have them', () => {
      const history = [
        makeHistoryEntry({ timestamp: '2026-01-01T00:00:00Z' }),
        makeHistoryEntry({ timestamp: '2026-01-02T00:00:00Z', message: 'Revision needed.' }),
        makeHistoryEntry({ timestamp: '2026-01-03T00:00:00Z', status: 'approved' }),
      ]
      const wrapper = mountTimeline(history)
      expect(wrapper.find('[data-testid="timeline-message-0"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="timeline-message-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="timeline-message-2"]').exists()).toBe(false)
    })
  })
})
