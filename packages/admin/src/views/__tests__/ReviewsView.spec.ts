import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReviewsView from '../ReviewsView.vue'

vi.mock('@/api', () => ({
  getApps: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('@/stores/reviews', () => ({
  useReviewsStore: vi.fn(() => ({
    reviews: [],
    loading: false,
    pendingCount: 0,
    fetchReviews: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    bulkApprove: vi.fn(),
  })),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({
    showSnackbar: vi.fn(),
  })),
}))

describe('ReviewsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders title "Reviews"', () => {
    const wrapper = mount(ReviewsView)
    expect(wrapper.text()).toContain('Reviews')
  })

  it('shows info alert when no tenant selected', () => {
    const wrapper = mount(ReviewsView)
    const alert = wrapper.find('.v-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Select a collection program to view its reviews')
  })

  it('renders tenant selector', () => {
    const wrapper = mount(ReviewsView)
    const select = wrapper.findComponent({ name: 'v-select' })
    expect(select.exists()).toBe(true)
    expect(select.props('label')).toBe('Select Collection Program')
  })
})
