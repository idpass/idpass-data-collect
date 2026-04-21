import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReviewsStore } from '../reviews'
import type { ReviewRecord, ReviewConfigRecord } from '@/api'

const mockGetReviews = vi.fn()
const mockApproveReview = vi.fn()
const mockRejectReview = vi.fn()
const mockBulkApproveReviews = vi.fn()
const mockGetReviewConfigs = vi.fn()
const mockSetReviewConfig = vi.fn()

vi.mock('@/api', () => ({
  getReviews: (...args: unknown[]) => mockGetReviews(...args),
  approveReview: (...args: unknown[]) => mockApproveReview(...args),
  rejectReview: (...args: unknown[]) => mockRejectReview(...args),
  bulkApproveReviews: (...args: unknown[]) => mockBulkApproveReviews(...args),
  getReviewConfigs: (...args: unknown[]) => mockGetReviewConfigs(...args),
  setReviewConfig: (...args: unknown[]) => mockSetReviewConfig(...args),
}))

function makeReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    submissionGuid: 'sub-1',
    programId: 'tenant-1',
    status: 'pending',
    submittedBy: 'user-1',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    eventType: 'create-group',
    entityGuid: 'entity-1',
    formData: {
      guid: 'sub-1',
      entityGuid: 'entity-1',
      type: 'create-group',
      data: {},
      timestamp: '2026-01-01T00:00:00Z',
      userId: 'user-1',
      syncLevel: 1,
    },
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('reviews store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchReviews', () => {
    it('calls API with correct tenantId and sets reviews state', async () => {
      const reviews = [makeReview(), makeReview({ id: 'review-2' })]
      mockGetReviews.mockResolvedValue({ reviews })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')

      expect(mockGetReviews).toHaveBeenCalledWith('tenant-1', undefined)
      expect(store.reviews).toEqual(reviews)
      expect(store.selectedTenantId).toBe('tenant-1')
      expect(store.loading).toBe(false)
    })

    it('passes status filter to API when provided', async () => {
      mockGetReviews.mockResolvedValue({ reviews: [] })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1', 'approved')

      expect(mockGetReviews).toHaveBeenCalledWith('tenant-1', 'approved')
      expect(store.statusFilter).toBe('approved')
    })

    it('sets loading to true during fetch and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockGetReviews.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
      )

      const store = useReviewsStore()
      const fetchPromise = store.fetchReviews('tenant-1')

      expect(store.loading).toBe(true)

      resolvePromise!({ reviews: [] })
      await fetchPromise

      expect(store.loading).toBe(false)
    })

    it('sets loading to false even when API throws', async () => {
      mockGetReviews.mockRejectedValue(new Error('Network error'))

      const store = useReviewsStore()
      await expect(store.fetchReviews('tenant-1')).rejects.toThrow('Network error')

      expect(store.loading).toBe(false)
    })

    it('clears statusFilter when no status argument is provided', async () => {
      mockGetReviews.mockResolvedValue({ reviews: [] })

      const store = useReviewsStore()
      // First set a filter
      await store.fetchReviews('tenant-1', 'pending')
      expect(store.statusFilter).toBe('pending')

      // Then fetch without filter
      await store.fetchReviews('tenant-1')
      expect(store.statusFilter).toBeNull()
    })
  })

  describe('approve', () => {
    it('updates the review in the array after approval', async () => {
      const original = makeReview({ id: 'review-1', status: 'pending' })
      const approved = makeReview({ id: 'review-1', status: 'approved', reviewedBy: 'admin-1' })
      mockGetReviews.mockResolvedValue({ reviews: [original] })
      mockApproveReview.mockResolvedValue({ review: approved })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')
      await store.approve('review-1')

      expect(mockApproveReview).toHaveBeenCalledWith('review-1', 'tenant-1')
      expect(store.reviews[0]).toEqual(approved)
    })

    it('does nothing when no tenantId is selected', async () => {
      const store = useReviewsStore()
      await store.approve('review-1')

      expect(mockApproveReview).not.toHaveBeenCalled()
    })

    it('does not modify array when review id is not found', async () => {
      const original = makeReview({ id: 'review-1' })
      mockGetReviews.mockResolvedValue({ reviews: [original] })
      mockApproveReview.mockResolvedValue({
        review: makeReview({ id: 'review-999', status: 'approved' }),
      })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')
      await store.approve('review-999')

      expect(store.reviews).toEqual([original])
    })
  })

  describe('reject', () => {
    it('updates the review in the array after rejection', async () => {
      const original = makeReview({ id: 'review-1', status: 'pending' })
      const rejected = makeReview({
        id: 'review-1',
        status: 'rejected',
        rejectionReason: 'Invalid data',
      })
      mockGetReviews.mockResolvedValue({ reviews: [original] })
      mockRejectReview.mockResolvedValue({ review: rejected })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')
      await store.reject('review-1', 'Invalid data')

      expect(mockRejectReview).toHaveBeenCalledWith('review-1', 'tenant-1', 'Invalid data')
      expect(store.reviews[0]).toEqual(rejected)
    })

    it('does nothing when no tenantId is selected', async () => {
      const store = useReviewsStore()
      await store.reject('review-1', 'reason')

      expect(mockRejectReview).not.toHaveBeenCalled()
    })
  })

  describe('bulkApprove', () => {
    it('calls API with review ids and tenant, then refreshes reviews', async () => {
      const reviews = [makeReview({ id: 'r1' }), makeReview({ id: 'r2' })]
      const bulkResult = { approved: 2, failed: 0, errors: [] }
      mockBulkApproveReviews.mockResolvedValue(bulkResult)
      mockGetReviews.mockResolvedValue({ reviews })

      const store = useReviewsStore()
      // Set up tenantId first
      await store.fetchReviews('tenant-1')
      vi.clearAllMocks()

      mockBulkApproveReviews.mockResolvedValue(bulkResult)
      mockGetReviews.mockResolvedValue({ reviews: [] })

      const result = await store.bulkApprove(['r1', 'r2'])

      expect(mockBulkApproveReviews).toHaveBeenCalledWith(['r1', 'r2'], 'tenant-1')
      expect(mockGetReviews).toHaveBeenCalledWith('tenant-1', undefined)
      expect(result).toEqual(bulkResult)
    })

    it('returns null when no tenantId is selected', async () => {
      const store = useReviewsStore()
      const result = await store.bulkApprove(['r1'])

      expect(mockBulkApproveReviews).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('fetchConfigs', () => {
    it('loads configs and sets reviewConfigs state', async () => {
      const configs: ReviewConfigRecord[] = [
        { eventType: 'create-group', policy: 'internal-review' },
        { eventType: 'update-individual', policy: 'auto-approve' },
      ]
      mockGetReviewConfigs.mockResolvedValue({ configs })

      const store = useReviewsStore()
      await store.fetchConfigs('tenant-1')

      expect(mockGetReviewConfigs).toHaveBeenCalledWith('tenant-1')
      expect(store.reviewConfigs).toEqual(configs)
    })
  })

  describe('pendingCount', () => {
    it('returns count of reviews with pending status', async () => {
      const reviews = [
        makeReview({ id: 'r1', status: 'pending' }),
        makeReview({ id: 'r2', status: 'approved' }),
        makeReview({ id: 'r3', status: 'pending' }),
        makeReview({ id: 'r4', status: 'rejected' }),
      ]
      mockGetReviews.mockResolvedValue({ reviews })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')

      expect(store.pendingCount).toBe(2)
    })

    it('returns 0 when no reviews are loaded', () => {
      const store = useReviewsStore()
      expect(store.pendingCount).toBe(0)
    })
  })

  describe('filteredReviews', () => {
    it('returns all reviews when statusFilter is null', async () => {
      const reviews = [
        makeReview({ id: 'r1', status: 'pending' }),
        makeReview({ id: 'r2', status: 'approved' }),
      ]
      mockGetReviews.mockResolvedValue({ reviews })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1')

      expect(store.filteredReviews).toEqual(reviews)
    })

    it('filters reviews by status when statusFilter is set', async () => {
      const pending = makeReview({ id: 'r1', status: 'pending' })
      const approved = makeReview({ id: 'r2', status: 'approved' })
      const rejected = makeReview({ id: 'r3', status: 'rejected' })
      mockGetReviews.mockResolvedValue({ reviews: [pending, approved, rejected] })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1', 'pending')

      expect(store.filteredReviews).toEqual([pending])
    })

    it('returns empty array when no reviews match the filter', async () => {
      const reviews = [makeReview({ id: 'r1', status: 'approved' })]
      mockGetReviews.mockResolvedValue({ reviews })

      const store = useReviewsStore()
      await store.fetchReviews('tenant-1', 'rejected')

      expect(store.filteredReviews).toEqual([])
    })
  })
})
