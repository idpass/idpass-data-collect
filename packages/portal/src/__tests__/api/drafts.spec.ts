import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PortalDraft } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGet, mockPut, mockDelete } = vi.hoisted(() => {
  return { mockGet: vi.fn(), mockPut: vi.fn(), mockDelete: vi.fn() }
})

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: mockPut,
    patch: vi.fn(),
    delete: mockDelete,
  },
  initializeApi: vi.fn(),
  getApiInstance: vi.fn(),
}))

import { getDrafts, saveDraft, deleteDraft } from '@/api/drafts'

const makeDraft = (overrides?: Partial<PortalDraft>): PortalDraft => ({
  id: 'draft-001',
  changeRequestType: 'registration',
  typeLabel: 'New Registration',
  formData: { firstName: 'John' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('drafts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDrafts()', () => {
    it('makes a GET request to /api/portal/drafts', async () => {
      mockGet.mockResolvedValue({ data: [] })

      await getDrafts()

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/drafts')
    })

    it('returns the drafts array', async () => {
      const drafts = [makeDraft(), makeDraft({ id: 'draft-002' })]
      mockGet.mockResolvedValue({ data: drafts })

      const result = await getDrafts()

      expect(result).toEqual(drafts)
      expect(result).toHaveLength(2)
    })

    it('returns an empty array when no drafts exist', async () => {
      mockGet.mockResolvedValue({ data: [] })

      const result = await getDrafts()

      expect(result).toEqual([])
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(getDrafts()).rejects.toThrow('Network error')
    })
  })

  describe('saveDraft()', () => {
    it('makes a PUT request to /api/portal/drafts/:id', async () => {
      const draft = makeDraft()
      mockPut.mockResolvedValue({ data: draft })

      await saveDraft('draft-001', 'registration', { firstName: 'John' })

      expect(mockPut).toHaveBeenCalledOnce()
      expect(mockPut).toHaveBeenCalledWith('/api/portal/drafts/draft-001', {
        changeRequestType: 'registration',
        formData: { firstName: 'John' },
      })
    })

    it('uses the draft id in the URL path', async () => {
      const draft = makeDraft({ id: 'draft-xyz' })
      mockPut.mockResolvedValue({ data: draft })

      await saveDraft('draft-xyz', 'update', {})

      expect(mockPut).toHaveBeenCalledWith('/api/portal/drafts/draft-xyz', expect.any(Object))
    })

    it('returns the saved draft', async () => {
      const draft = makeDraft({ formData: { firstName: 'Jane' } })
      mockPut.mockResolvedValue({ data: draft })

      const result = await saveDraft('draft-001', 'registration', { firstName: 'Jane' })

      expect(result).toEqual(draft)
      expect(result.formData).toEqual({ firstName: 'Jane' })
    })

    it('sends changeRequestType in the request body', async () => {
      const draft = makeDraft()
      mockPut.mockResolvedValue({ data: draft })

      await saveDraft('draft-001', 'address-update', { street: '123 Main St' })

      const callArg = mockPut.mock.calls[0][1] as { changeRequestType: string }
      expect(callArg.changeRequestType).toBe('address-update')
    })

    it('propagates errors from the API', async () => {
      mockPut.mockRejectedValue(new Error('Conflict'))

      await expect(saveDraft('draft-001', 'registration', {})).rejects.toThrow('Conflict')
    })
  })

  describe('deleteDraft()', () => {
    it('makes a DELETE request to /api/portal/drafts/:id', async () => {
      mockDelete.mockResolvedValue({ data: undefined })

      await deleteDraft('draft-001')

      expect(mockDelete).toHaveBeenCalledOnce()
      expect(mockDelete).toHaveBeenCalledWith('/api/portal/drafts/draft-001')
    })

    it('uses the draft id in the URL path', async () => {
      mockDelete.mockResolvedValue({ data: undefined })

      await deleteDraft('draft-abc')

      expect(mockDelete).toHaveBeenCalledWith('/api/portal/drafts/draft-abc')
    })

    it('returns void on success', async () => {
      mockDelete.mockResolvedValue({ data: undefined })

      const result = await deleteDraft('draft-001')

      expect(result).toBeUndefined()
    })

    it('propagates errors from the API', async () => {
      mockDelete.mockRejectedValue(new Error('Not found'))

      await expect(deleteDraft('draft-001')).rejects.toThrow('Not found')
    })
  })
})
