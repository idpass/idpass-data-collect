import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ReviewsView from '../ReviewsView.vue'
import type { ReviewRecord } from '@/api'

function makeReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    submissionGuid: 'sub-1',
    programId: 'tenant-1',
    status: 'pending',
    submittedBy: 'enumerator@datacollect.lan',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    eventType: 'create-individual',
    entityGuid: 'entity-guid-001',
    formData: {
      guid: 'sub-1',
      entityGuid: 'entity-guid-001',
      type: 'create-individual',
      data: {
        first_name: 'Somsak',
        last_name: 'Phanthavong',
        gender: 'male',
        date_of_birth: '1995-05-20',
      },
      timestamp: '2026-02-20T21:49:00Z',
      userId: 'enumerator@datacollect.lan',
      syncLevel: 1,
    },
    createdAt: '2026-02-20T21:49:00Z',
    ...overrides,
  }
}

vi.mock('@/api', () => ({
  getApps: vi.fn().mockResolvedValue({ data: [] }),
}))

const mockReviewsStore = {
  reviews: [] as ReviewRecord[],
  loading: false,
  pendingCount: 0,
  fetchReviews: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  bulkApprove: vi.fn(),
}

vi.mock('@/stores/reviews', () => ({
  useReviewsStore: vi.fn(() => mockReviewsStore),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({
    showSnackbar: vi.fn(),
  })),
}))

describe('ReviewsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockReviewsStore.reviews = []
    mockReviewsStore.loading = false
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

  describe('detail dialog', () => {
    it('does not show detail dialog by default', () => {
      const wrapper = mount(ReviewsView)
      expect(wrapper.text()).not.toContain('Review Detail')
    })

    it('exposes formatFieldLabel that converts snake_case to Title Case', () => {
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as { formatFieldLabel: (key: string) => string }
      expect(vm.formatFieldLabel('first_name')).toBe('First Name')
      expect(vm.formatFieldLabel('date_of_birth')).toBe('Date Of Birth')
      expect(vm.formatFieldLabel('gender')).toBe('Gender')
    })

    it('exposes formatFieldLabel that converts camelCase to Title Case', () => {
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as { formatFieldLabel: (key: string) => string }
      expect(vm.formatFieldLabel('firstName')).toBe('First Name')
      expect(vm.formatFieldLabel('dateOfBirth')).toBe('Date Of Birth')
    })

    it('computes formDataEntries from selectedReview', async () => {
      const review = makeReview()
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as {
        selectedReview: ReviewRecord | null
        formDataEntries: Array<{ label: string; value: string }>
      }

      vm.selectedReview = review
      await nextTick()

      expect(vm.formDataEntries).toEqual([
        { label: 'First Name', value: 'Somsak' },
        { label: 'Last Name', value: 'Phanthavong' },
        { label: 'Gender', value: 'male' },
        { label: 'Date Of Birth', value: '1995-05-20' },
      ])
    })

    it('returns empty formDataEntries when no review is selected', () => {
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as {
        formDataEntries: Array<{ label: string; value: string }>
      }
      expect(vm.formDataEntries).toEqual([])
    })

    it('handleRowClick sets selectedReview and opens detail dialog', async () => {
      const review = makeReview()
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as {
        selectedReview: ReviewRecord | null
        showDetailDialog: boolean
        handleRowClick: (event: Event, row: { item: ReviewRecord }) => void
      }

      vm.handleRowClick(new Event('click'), { item: review })
      await nextTick()

      expect(vm.selectedReview).toEqual(review)
      expect(vm.showDetailDialog).toBe(true)
    })

    it('sets selectedReview with rejection details for rejected reviews', async () => {
      const review = makeReview({
        status: 'rejected',
        rejectionReason: 'Data is incomplete',
        reviewedBy: 'admin@datacollect.lan',
        reviewedAt: '2026-02-21T10:00:00Z',
      })
      const wrapper = mount(ReviewsView) as VueWrapper<InstanceType<typeof ReviewsView>>
      const vm = wrapper.vm as unknown as {
        selectedReview: ReviewRecord | null
        showDetailDialog: boolean
        handleRowClick: (event: Event, row: { item: ReviewRecord }) => void
      }

      vm.handleRowClick(new Event('click'), { item: review })
      await nextTick()

      expect(vm.showDetailDialog).toBe(true)
      expect(vm.selectedReview).not.toBeNull()
      expect(vm.selectedReview!.rejectionReason).toBe('Data is incomplete')
      expect(vm.selectedReview!.reviewedBy).toBe('admin@datacollect.lan')
      expect(vm.selectedReview!.status).toBe('rejected')
    })
  })
})
