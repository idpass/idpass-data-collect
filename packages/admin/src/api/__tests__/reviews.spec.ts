import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInstance = {
  get: vi.fn().mockResolvedValue({ data: {} }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue({ data: {} }),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockInstance),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    token: 'test-token',
    logout: vi.fn(),
  })),
}))

describe('review API functions', () => {
  let api: typeof import('@/api')

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset the module so `instance` is null before each test
    vi.resetModules()
    // Re-import to get a fresh module with instance = null
    api = await import('@/api')
    // Initialize the axios instance so API calls do not throw
    api.initializeInstance()
  })

  it('getReviews calls GET /api/reviews with tenantId param', async () => {
    mockInstance.get.mockResolvedValueOnce({
      data: { reviews: [] },
    })

    await api.getReviews('tenant-1')

    expect(mockInstance.get).toHaveBeenCalledWith('/api/reviews', {
      params: { tenantId: 'tenant-1' },
    })
  })

  it('getReviews passes optional status param', async () => {
    mockInstance.get.mockResolvedValueOnce({
      data: { reviews: [] },
    })

    await api.getReviews('tenant-1', 'pending')

    expect(mockInstance.get).toHaveBeenCalledWith('/api/reviews', {
      params: { tenantId: 'tenant-1', status: 'pending' },
    })
  })

  it('approveReview calls POST /api/reviews/:id/approve with tenantId', async () => {
    mockInstance.post.mockResolvedValueOnce({
      data: { review: { id: 'review-1', status: 'approved' } },
    })

    await api.approveReview('review-1', 'tenant-1')

    expect(mockInstance.post).toHaveBeenCalledWith('/api/reviews/review-1/approve', {
      tenantId: 'tenant-1',
    })
  })

  it('rejectReview calls POST /api/reviews/:id/reject with tenantId and reason', async () => {
    mockInstance.post.mockResolvedValueOnce({
      data: { review: { id: 'review-1', status: 'rejected' } },
    })

    await api.rejectReview('review-1', 'tenant-1', 'Invalid data')

    expect(mockInstance.post).toHaveBeenCalledWith('/api/reviews/review-1/reject', {
      tenantId: 'tenant-1',
      reason: 'Invalid data',
    })
  })

  it('bulkApproveReviews calls POST /api/reviews/bulk-approve with reviewIds and tenantId', async () => {
    mockInstance.post.mockResolvedValueOnce({
      data: { approved: 2, failed: 0, errors: [] },
    })

    await api.bulkApproveReviews(['review-1', 'review-2'], 'tenant-1')

    expect(mockInstance.post).toHaveBeenCalledWith('/api/reviews/bulk-approve', {
      reviewIds: ['review-1', 'review-2'],
      tenantId: 'tenant-1',
    })
  })

  it('getReviewConfigs calls GET /api/reviews/config/:tenantId', async () => {
    mockInstance.get.mockResolvedValueOnce({
      data: { configs: [] },
    })

    await api.getReviewConfigs('tenant-1')

    expect(mockInstance.get).toHaveBeenCalledWith('/api/reviews/config/tenant-1')
  })

  it('setReviewConfig calls PUT /api/reviews/config/:tenantId/:eventType with config body', async () => {
    mockInstance.put.mockResolvedValueOnce({
      data: { status: 'ok', config: { eventType: 'create-group', policy: 'auto-approve' } },
    })

    await api.setReviewConfig('tenant-1', 'create-group', {
      policy: 'auto-approve',
    })

    expect(mockInstance.put).toHaveBeenCalledWith('/api/reviews/config/tenant-1/create-group', {
      policy: 'auto-approve',
    })
  })
})
