import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RequestType, PortalRequest } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGet, mockPost } = vi.hoisted(() => {
  return { mockGet: vi.fn(), mockPost: vi.fn() }
})

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  initializeApi: vi.fn(),
  getApiInstance: vi.fn(),
}))

import { getRequestTypes, getRequestTypeForm, createRequest } from '@/api/changeRequests'

const makeRequestType = (overrides?: Partial<RequestType>): RequestType => ({
  code: 'registration',
  label: 'New Registration',
  description: 'Register as a new beneficiary',
  icon: 'mdi-account-plus',
  ...overrides,
})

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

describe('changeRequests API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRequestTypes()', () => {
    it('makes a GET request to /api/portal/requests/types', async () => {
      const types = [makeRequestType()]
      mockGet.mockResolvedValue({ data: types })

      await getRequestTypes()

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests/types')
    })

    it('returns the request types array', async () => {
      const types = [makeRequestType(), makeRequestType({ code: 'update', label: 'Update' })]
      mockGet.mockResolvedValue({ data: types })

      const result = await getRequestTypes()

      expect(result).toEqual(types)
      expect(result).toHaveLength(2)
    })

    it('returns an empty array when no types are available', async () => {
      mockGet.mockResolvedValue({ data: [] })

      const result = await getRequestTypes()

      expect(result).toEqual([])
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(getRequestTypes()).rejects.toThrow('Network error')
    })
  })

  describe('getRequestTypeForm()', () => {
    it('makes a GET request to the correct endpoint with type code', async () => {
      mockGet.mockResolvedValue({
        data: { formioSchema: { components: [] }, schemaChanged: false },
      })

      await getRequestTypeForm('registration')

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests/types/registration/form')
    })

    it('uses the typeCode in the URL path', async () => {
      mockGet.mockResolvedValue({
        data: { formioSchema: { components: [] }, schemaChanged: false },
      })

      await getRequestTypeForm('update-address')

      expect(mockGet).toHaveBeenCalledWith('/api/portal/requests/types/update-address/form')
    })

    it('returns formioSchema and schemaChanged', async () => {
      const schema = { components: [{ type: 'textfield', key: 'name', label: 'Name' }] }
      mockGet.mockResolvedValue({
        data: { formioSchema: schema, schemaChanged: true },
      })

      const result = await getRequestTypeForm('registration')

      expect(result.formioSchema).toEqual(schema)
      expect(result.schemaChanged).toBe(true)
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Not found'))

      await expect(getRequestTypeForm('unknown')).rejects.toThrow('Not found')
    })
  })

  describe('createRequest()', () => {
    it('makes a POST request to /api/portal/requests', async () => {
      const request = makePortalRequest()
      mockPost.mockResolvedValue({ data: request })

      await createRequest('registration', { firstName: 'John' })

      expect(mockPost).toHaveBeenCalledOnce()
      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests', {
        type: 'registration',
        formData: { firstName: 'John' },
        submit: false,
      })
    })

    it('passes submit=true when submit param is true', async () => {
      const request = makePortalRequest()
      mockPost.mockResolvedValue({ data: request })

      await createRequest('registration', { firstName: 'John' }, true)

      expect(mockPost).toHaveBeenCalledWith('/api/portal/requests', {
        type: 'registration',
        formData: { firstName: 'John' },
        submit: true,
      })
    })

    it('defaults submit to false', async () => {
      const request = makePortalRequest()
      mockPost.mockResolvedValue({ data: request })

      await createRequest('registration', { firstName: 'John' })

      const callArg = mockPost.mock.calls[0][1] as { submit: boolean }
      expect(callArg.submit).toBe(false)
    })

    it('returns the created portal request', async () => {
      const request = makePortalRequest({ reference: 'REQ-999' })
      mockPost.mockResolvedValue({ data: request })

      const result = await createRequest('registration', {})

      expect(result).toEqual(request)
      expect(result.reference).toBe('REQ-999')
    })

    it('propagates errors from the API', async () => {
      mockPost.mockRejectedValue(new Error('Validation error'))

      await expect(createRequest('registration', {})).rejects.toThrow('Validation error')
    })
  })
})
