import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PortalRequest } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockSearchRequests, mockGetRequest } = vi.hoisted(() => ({
  mockSearchRequests: vi.fn(),
  mockGetRequest: vi.fn(),
}))

vi.mock('@/api/requests', () => ({
  searchRequests: mockSearchRequests,
  getRequest: mockGetRequest,
  updateRequest: vi.fn(),
  submitRequest: vi.fn(),
  resetRequest: vi.fn(),
}))

import { useChangeRequestsStore } from '@/stores/changeRequests'

const makePortalRequest = (overrides?: Partial<PortalRequest>): PortalRequest => ({
  reference: 'REQ-001',
  type: 'registration',
  typeLabel: 'New Registration',
  status: 'pending',
  formData: { firstName: 'John' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  submittedAt: null,
  history: [],
  ...overrides,
})

describe('useChangeRequestsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with an empty requests array', () => {
      const store = useChangeRequestsStore()
      expect(store.requests).toEqual([])
    })

    it('starts with null currentRequest', () => {
      const store = useChangeRequestsStore()
      expect(store.currentRequest).toBeNull()
    })

    it('starts with total of 0', () => {
      const store = useChangeRequestsStore()
      expect(store.total).toBe(0)
    })

    it('starts not loading', () => {
      const store = useChangeRequestsStore()
      expect(store.isLoading).toBe(false)
    })

    it('starts with no error', () => {
      const store = useChangeRequestsStore()
      expect(store.error).toBeNull()
    })

    it('requestsByStatus is empty initially', () => {
      const store = useChangeRequestsStore()
      expect(store.requestsByStatus).toEqual({})
    })
  })

  describe('fetchRequests()', () => {
    it('calls searchRequests API', async () => {
      mockSearchRequests.mockResolvedValue({ data: [], total: 0 })
      const store = useChangeRequestsStore()

      await store.fetchRequests()

      expect(mockSearchRequests).toHaveBeenCalledOnce()
    })

    it('passes params to searchRequests', async () => {
      mockSearchRequests.mockResolvedValue({ data: [], total: 0 })
      const store = useChangeRequestsStore()

      await store.fetchRequests({ status: 'pending', page: 2, pageSize: 10 })

      expect(mockSearchRequests).toHaveBeenCalledWith({ status: 'pending', page: 2, pageSize: 10 })
    })

    it('populates requests from API response', async () => {
      const requests = [makePortalRequest(), makePortalRequest({ reference: 'REQ-002' })]
      mockSearchRequests.mockResolvedValue({ data: requests, total: 2 })
      const store = useChangeRequestsStore()

      await store.fetchRequests()

      expect(store.requests).toEqual(requests)
    })

    it('sets total from API response', async () => {
      const requests = [makePortalRequest()]
      mockSearchRequests.mockResolvedValue({ data: requests, total: 42 })
      const store = useChangeRequestsStore()

      await store.fetchRequests()

      expect(store.total).toBe(42)
    })

    it('sets isLoading to true during fetch then false after', async () => {
      let resolve: (val: { data: PortalRequest[]; total: number }) => void = () => {}
      mockSearchRequests.mockReturnValue(new Promise((r) => { resolve = r }))
      const store = useChangeRequestsStore()

      const fetchPromise = store.fetchRequests()
      expect(store.isLoading).toBe(true)

      resolve({ data: [], total: 0 })
      await fetchPromise
      expect(store.isLoading).toBe(false)
    })

    it('sets error on API failure', async () => {
      mockSearchRequests.mockRejectedValue(new Error('Network error'))
      const store = useChangeRequestsStore()

      await store.fetchRequests()

      expect(store.error).toBe('Network error')
    })

    it('clears isLoading after error', async () => {
      mockSearchRequests.mockRejectedValue(new Error('Network error'))
      const store = useChangeRequestsStore()

      await store.fetchRequests()

      expect(store.isLoading).toBe(false)
    })

    it('clears error before fetching', async () => {
      mockSearchRequests.mockRejectedValue(new Error('First error'))
      const store = useChangeRequestsStore()
      await store.fetchRequests()
      expect(store.error).toBe('First error')

      mockSearchRequests.mockResolvedValue({ data: [], total: 0 })
      await store.fetchRequests()

      expect(store.error).toBeNull()
    })
  })

  describe('fetchRequestDetail()', () => {
    it('calls getRequest API with the ref', async () => {
      const request = makePortalRequest()
      mockGetRequest.mockResolvedValue(request)
      const store = useChangeRequestsStore()

      await store.fetchRequestDetail('REQ-001')

      expect(mockGetRequest).toHaveBeenCalledOnce()
      expect(mockGetRequest).toHaveBeenCalledWith('REQ-001')
    })

    it('sets currentRequest from API response', async () => {
      const request = makePortalRequest({ reference: 'REQ-001', status: 'revision' })
      mockGetRequest.mockResolvedValue(request)
      const store = useChangeRequestsStore()

      await store.fetchRequestDetail('REQ-001')

      expect(store.currentRequest).toEqual(request)
    })

    it('sets isLoading to true during fetch then false after', async () => {
      let resolve: (val: PortalRequest) => void = () => {}
      mockGetRequest.mockReturnValue(new Promise((r) => { resolve = r }))
      const store = useChangeRequestsStore()

      const fetchPromise = store.fetchRequestDetail('REQ-001')
      expect(store.isLoading).toBe(true)

      resolve(makePortalRequest())
      await fetchPromise
      expect(store.isLoading).toBe(false)
    })

    it('sets error on API failure', async () => {
      mockGetRequest.mockRejectedValue(new Error('Not found'))
      const store = useChangeRequestsStore()

      await store.fetchRequestDetail('REQ-NONEXISTENT')

      expect(store.error).toBe('Not found')
    })

    it('clears isLoading after error', async () => {
      mockGetRequest.mockRejectedValue(new Error('Not found'))
      const store = useChangeRequestsStore()

      await store.fetchRequestDetail('REQ-NONEXISTENT')

      expect(store.isLoading).toBe(false)
    })

    it('clears error before fetching', async () => {
      mockGetRequest.mockRejectedValue(new Error('First error'))
      const store = useChangeRequestsStore()
      await store.fetchRequestDetail('REQ-001')
      expect(store.error).toBe('First error')

      mockGetRequest.mockResolvedValue(makePortalRequest())
      await store.fetchRequestDetail('REQ-001')

      expect(store.error).toBeNull()
    })
  })

  describe('clearCurrentRequest()', () => {
    it('sets currentRequest to null', async () => {
      const request = makePortalRequest()
      mockGetRequest.mockResolvedValue(request)
      const store = useChangeRequestsStore()
      await store.fetchRequestDetail('REQ-001')
      expect(store.currentRequest).not.toBeNull()

      store.clearCurrentRequest()

      expect(store.currentRequest).toBeNull()
    })
  })

  describe('requestsByStatus getter', () => {
    it('returns empty object when no requests', () => {
      const store = useChangeRequestsStore()
      expect(store.requestsByStatus).toEqual({})
    })

    it('groups requests by status', () => {
      const store = useChangeRequestsStore()
      store.requests = [
        makePortalRequest({ reference: 'REQ-001', status: 'pending' }),
        makePortalRequest({ reference: 'REQ-002', status: 'pending' }),
        makePortalRequest({ reference: 'REQ-003', status: 'approved' }),
        makePortalRequest({ reference: 'REQ-004', status: 'revision' }),
      ]

      const byStatus = store.requestsByStatus

      expect(byStatus['pending']).toHaveLength(2)
      expect(byStatus['approved']).toHaveLength(1)
      expect(byStatus['revision']).toHaveLength(1)
    })

    it('includes all request references in the grouped result', () => {
      const store = useChangeRequestsStore()
      store.requests = [
        makePortalRequest({ reference: 'REQ-001', status: 'pending' }),
        makePortalRequest({ reference: 'REQ-002', status: 'pending' }),
      ]

      const byStatus = store.requestsByStatus

      expect(byStatus['pending'].map((r) => r.reference)).toEqual(['REQ-001', 'REQ-002'])
    })

    it('handles all request status types', () => {
      const store = useChangeRequestsStore()
      store.requests = [
        makePortalRequest({ reference: 'REQ-1', status: 'draft' }),
        makePortalRequest({ reference: 'REQ-2', status: 'pending' }),
        makePortalRequest({ reference: 'REQ-3', status: 'revision' }),
        makePortalRequest({ reference: 'REQ-4', status: 'approved' }),
        makePortalRequest({ reference: 'REQ-5', status: 'rejected' }),
        makePortalRequest({ reference: 'REQ-6', status: 'applied' }),
      ]

      const byStatus = store.requestsByStatus

      expect(byStatus['draft']).toHaveLength(1)
      expect(byStatus['pending']).toHaveLength(1)
      expect(byStatus['revision']).toHaveLength(1)
      expect(byStatus['approved']).toHaveLength(1)
      expect(byStatus['rejected']).toHaveLength(1)
      expect(byStatus['applied']).toHaveLength(1)
    })
  })
})
