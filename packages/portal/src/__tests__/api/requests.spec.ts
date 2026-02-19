import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PortalRequest } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGet, mockPost, mockPut } = vi.hoisted(() => {
  return { mockGet: vi.fn(), mockPost: vi.fn(), mockPut: vi.fn() }
})

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: vi.fn(),
    delete: vi.fn(),
  },
  initializeApi: vi.fn(),
  getApiInstance: vi.fn(),
}))

import {
  searchRequests,
  getRequest,
  updateRequest,
  submitRequest,
  resetRequest,
} from '@/api/requests'

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

describe('requests API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('searchRequests()', () => {
    it('makes a GET request to /api/portal/requests', async () => {
      mockGet.mockResolvedValue({ data: { data: [], total: 0 } })

      await searchRequests()

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests', { params: undefined })
    })

    it('passes query params when provided', async () => {
      mockGet.mockResolvedValue({ data: { data: [], total: 0 } })

      await searchRequests({ status: 'pending', page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests', {
        params: { status: 'pending', page: 2, pageSize: 20 },
      })
    })

    it('returns data and total from response', async () => {
      const requests = [makePortalRequest(), makePortalRequest({ reference: 'REQ-002' })]
      mockGet.mockResolvedValue({ data: { data: requests, total: 2 } })

      const result = await searchRequests()

      expect(result.data).toEqual(requests)
      expect(result.total).toBe(2)
    })

    it('returns empty data and zero total when no results', async () => {
      mockGet.mockResolvedValue({ data: { data: [], total: 0 } })

      const result = await searchRequests()

      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(searchRequests()).rejects.toThrow('Network error')
    })
  })

  describe('getRequest()', () => {
    it('makes a GET request to /api/portal/requests/:ref', async () => {
      const request = makePortalRequest()
      mockGet.mockResolvedValue({ data: request })

      await getRequest('REQ-001')

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests/REQ-001')
    })

    it('uses the ref in the URL path', async () => {
      const request = makePortalRequest({ reference: 'REQ-XYZ' })
      mockGet.mockResolvedValue({ data: request })

      await getRequest('REQ-XYZ')

      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests/REQ-XYZ')
    })

    it('returns the portal request', async () => {
      const request = makePortalRequest({ reference: 'REQ-001', status: 'approved' })
      mockGet.mockResolvedValue({ data: request })

      const result = await getRequest('REQ-001')

      expect(result).toEqual(request)
      expect(result.status).toBe('approved')
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Not found'))

      await expect(getRequest('NONEXISTENT')).rejects.toThrow('Not found')
    })
  })

  describe('updateRequest()', () => {
    it('makes a PUT request to /api/portal/requests/:ref', async () => {
      const request = makePortalRequest()
      mockPut.mockResolvedValue({ data: request })

      await updateRequest('REQ-001', { firstName: 'Jane' })

      expect(mockPut).toHaveBeenCalledOnce()
      expect(mockPut).toHaveBeenCalledWith('/api/portal/requests/REQ-001', {
        formData: { firstName: 'Jane' },
      })
    })

    it('uses the ref in the URL path', async () => {
      const request = makePortalRequest()
      mockPut.mockResolvedValue({ data: request })

      await updateRequest('REQ-ABC', {})

      expect(mockPut).toHaveBeenCalledWith('/api/portal/requests/REQ-ABC', expect.any(Object))
    })

    it('sends formData in the request body', async () => {
      const request = makePortalRequest()
      mockPut.mockResolvedValue({ data: request })

      await updateRequest('REQ-001', { firstName: 'Jane', lastName: 'Doe' })

      const callArg = mockPut.mock.calls[0][1] as { formData: Record<string, unknown> }
      expect(callArg.formData).toEqual({ firstName: 'Jane', lastName: 'Doe' })
    })

    it('returns the updated portal request', async () => {
      const request = makePortalRequest({ formData: { firstName: 'Jane' } })
      mockPut.mockResolvedValue({ data: request })

      const result = await updateRequest('REQ-001', { firstName: 'Jane' })

      expect(result).toEqual(request)
    })

    it('propagates errors from the API', async () => {
      mockPut.mockRejectedValue(new Error('Conflict'))

      await expect(updateRequest('REQ-001', {})).rejects.toThrow('Conflict')
    })
  })

  describe('submitRequest()', () => {
    it('makes a POST request to /api/portal/requests/:ref/submit', async () => {
      const request = makePortalRequest({ status: 'pending' })
      mockPost.mockResolvedValue({ data: request })

      await submitRequest('REQ-001')

      expect(mockPost).toHaveBeenCalledOnce()
      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests/REQ-001/submit')
    })

    it('uses the ref in the URL path', async () => {
      const request = makePortalRequest()
      mockPost.mockResolvedValue({ data: request })

      await submitRequest('REQ-XYZ')

      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests/REQ-XYZ/submit')
    })

    it('returns the updated portal request with pending status', async () => {
      const request = makePortalRequest({ status: 'pending', submittedAt: '2026-01-01T00:00:00Z' })
      mockPost.mockResolvedValue({ data: request })

      const result = await submitRequest('REQ-001')

      expect(result).toEqual(request)
      expect(result.status).toBe('pending')
    })

    it('propagates errors from the API', async () => {
      mockPost.mockRejectedValue(new Error('Validation error'))

      await expect(submitRequest('REQ-001')).rejects.toThrow('Validation error')
    })
  })

  describe('resetRequest()', () => {
    it('makes a POST request to /api/portal/requests/:ref/reset', async () => {
      const request = makePortalRequest({ status: 'draft' })
      mockPost.mockResolvedValue({ data: request })

      await resetRequest('REQ-001')

      expect(mockPost).toHaveBeenCalledOnce()
      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests/REQ-001/reset')
    })

    it('uses the ref in the URL path', async () => {
      const request = makePortalRequest()
      mockPost.mockResolvedValue({ data: request })

      await resetRequest('REQ-XYZ')

      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests/REQ-XYZ/reset')
    })

    it('returns the reset portal request with draft status', async () => {
      const request = makePortalRequest({ status: 'draft' })
      mockPost.mockResolvedValue({ data: request })

      const result = await resetRequest('REQ-001')

      expect(result).toEqual(request)
      expect(result.status).toBe('draft')
    })

    it('propagates errors from the API', async () => {
      mockPost.mockRejectedValue(new Error('Not allowed'))

      await expect(resetRequest('REQ-001')).rejects.toThrow('Not allowed')
    })
  })
})
