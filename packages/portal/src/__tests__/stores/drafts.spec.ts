import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PortalDraft } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGetDrafts, mockSaveDraft, mockDeleteDraft } = vi.hoisted(() => ({
  mockGetDrafts: vi.fn(),
  mockSaveDraft: vi.fn(),
  mockDeleteDraft: vi.fn(),
}))

vi.mock('@/api/drafts', () => ({
  getDrafts: mockGetDrafts,
  saveDraft: mockSaveDraft,
  deleteDraft: mockDeleteDraft,
}))

import { useDraftsStore } from '@/stores/drafts'

const makeDraft = (overrides?: Partial<PortalDraft>): PortalDraft => ({
  id: 'draft-001',
  changeRequestType: 'registration',
  typeLabel: 'New Registration',
  formData: { firstName: 'John' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useDraftsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with an empty drafts array', () => {
      const store = useDraftsStore()
      expect(store.drafts).toEqual([])
    })

    it('starts not loading', () => {
      const store = useDraftsStore()
      expect(store.isLoading).toBe(false)
    })

    it('starts with no error', () => {
      const store = useDraftsStore()
      expect(store.error).toBeNull()
    })

    it('draftsCount is 0 initially', () => {
      const store = useDraftsStore()
      expect(store.draftsCount).toBe(0)
    })

    it('draftsByType is empty initially', () => {
      const store = useDraftsStore()
      expect(store.draftsByType).toEqual({})
    })
  })

  describe('fetchDrafts()', () => {
    it('calls getDrafts API', async () => {
      mockGetDrafts.mockResolvedValue([])
      const store = useDraftsStore()

      await store.fetchDrafts()

      expect(mockGetDrafts).toHaveBeenCalledOnce()
    })

    it('populates drafts from API response', async () => {
      const drafts = [makeDraft(), makeDraft({ id: 'draft-002' })]
      mockGetDrafts.mockResolvedValue(drafts)
      const store = useDraftsStore()

      await store.fetchDrafts()

      expect(store.drafts).toEqual(drafts)
    })

    it('sets isLoading to true during fetch then false after', async () => {
      let resolve: (val: PortalDraft[]) => void = () => {}
      mockGetDrafts.mockReturnValue(new Promise((r) => { resolve = r }))
      const store = useDraftsStore()

      const fetchPromise = store.fetchDrafts()
      expect(store.isLoading).toBe(true)

      resolve([])
      await fetchPromise
      expect(store.isLoading).toBe(false)
    })

    it('sets error on API failure', async () => {
      mockGetDrafts.mockRejectedValue(new Error('Network error'))
      const store = useDraftsStore()

      await store.fetchDrafts()

      expect(store.error).toBe('Network error')
    })

    it('clears isLoading after error', async () => {
      mockGetDrafts.mockRejectedValue(new Error('Network error'))
      const store = useDraftsStore()

      await store.fetchDrafts()

      expect(store.isLoading).toBe(false)
    })

    it('clears error before fetching', async () => {
      mockGetDrafts.mockRejectedValue(new Error('First error'))
      const store = useDraftsStore()
      await store.fetchDrafts()
      expect(store.error).toBe('First error')

      mockGetDrafts.mockResolvedValue([])
      await store.fetchDrafts()

      expect(store.error).toBeNull()
    })
  })

  describe('saveDraft()', () => {
    it('calls saveDraft API with correct arguments', async () => {
      const draft = makeDraft()
      mockSaveDraft.mockResolvedValue(draft)
      const store = useDraftsStore()

      await store.saveDraft('draft-001', 'registration', { firstName: 'John' })

      expect(mockSaveDraft).toHaveBeenCalledOnce()
      expect(mockSaveDraft).toHaveBeenCalledWith('draft-001', 'registration', { firstName: 'John' })
    })

    it('updates an existing draft in the list', async () => {
      const original = makeDraft({ formData: { firstName: 'John' } })
      const updated = makeDraft({ formData: { firstName: 'Jane' } })
      mockSaveDraft.mockResolvedValue(updated)
      const store = useDraftsStore()
      store.drafts = [original]

      await store.saveDraft('draft-001', 'registration', { firstName: 'Jane' })

      expect(store.drafts).toHaveLength(1)
      expect(store.drafts[0].formData).toEqual({ firstName: 'Jane' })
    })

    it('appends a new draft when id not found in list', async () => {
      const newDraft = makeDraft({ id: 'draft-new' })
      mockSaveDraft.mockResolvedValue(newDraft)
      const store = useDraftsStore()
      store.drafts = [makeDraft({ id: 'draft-existing' })]

      await store.saveDraft('draft-new', 'registration', {})

      expect(store.drafts).toHaveLength(2)
      expect(store.drafts[1].id).toBe('draft-new')
    })

    it('returns the saved draft', async () => {
      const draft = makeDraft()
      mockSaveDraft.mockResolvedValue(draft)
      const store = useDraftsStore()

      const result = await store.saveDraft('draft-001', 'registration', {})

      expect(result).toEqual(draft)
    })

    it('propagates errors from the API', async () => {
      mockSaveDraft.mockRejectedValue(new Error('Save failed'))
      const store = useDraftsStore()

      await expect(store.saveDraft('draft-001', 'registration', {})).rejects.toThrow('Save failed')
    })
  })

  describe('removeDraft()', () => {
    it('calls deleteDraft API with correct id', async () => {
      mockDeleteDraft.mockResolvedValue(undefined)
      const store = useDraftsStore()
      store.drafts = [makeDraft()]

      await store.removeDraft('draft-001')

      expect(mockDeleteDraft).toHaveBeenCalledOnce()
      expect(mockDeleteDraft).toHaveBeenCalledWith('draft-001')
    })

    it('removes the draft from the list after deletion', async () => {
      mockDeleteDraft.mockResolvedValue(undefined)
      const store = useDraftsStore()
      store.drafts = [makeDraft({ id: 'draft-001' }), makeDraft({ id: 'draft-002' })]

      await store.removeDraft('draft-001')

      expect(store.drafts).toHaveLength(1)
      expect(store.drafts[0].id).toBe('draft-002')
    })

    it('propagates errors from the API', async () => {
      mockDeleteDraft.mockRejectedValue(new Error('Delete failed'))
      const store = useDraftsStore()
      store.drafts = [makeDraft()]

      await expect(store.removeDraft('draft-001')).rejects.toThrow('Delete failed')
    })
  })

  describe('draftsCount getter', () => {
    it('returns 0 when no drafts', () => {
      const store = useDraftsStore()
      expect(store.draftsCount).toBe(0)
    })

    it('returns the correct count', () => {
      const store = useDraftsStore()
      store.drafts = [makeDraft(), makeDraft({ id: 'draft-002' }), makeDraft({ id: 'draft-003' })]
      expect(store.draftsCount).toBe(3)
    })
  })

  describe('draftsByType getter', () => {
    it('returns empty object when no drafts', () => {
      const store = useDraftsStore()
      expect(store.draftsByType).toEqual({})
    })

    it('groups drafts by changeRequestType', () => {
      const store = useDraftsStore()
      store.drafts = [
        makeDraft({ id: 'draft-001', changeRequestType: 'registration' }),
        makeDraft({ id: 'draft-002', changeRequestType: 'registration' }),
        makeDraft({ id: 'draft-003', changeRequestType: 'address-update' }),
      ]

      const byType = store.draftsByType

      expect(byType['registration']).toHaveLength(2)
      expect(byType['address-update']).toHaveLength(1)
    })

    it('includes all draft ids in the grouped result', () => {
      const store = useDraftsStore()
      store.drafts = [
        makeDraft({ id: 'draft-001', changeRequestType: 'registration' }),
        makeDraft({ id: 'draft-002', changeRequestType: 'registration' }),
      ]

      const byType = store.draftsByType

      expect(byType['registration'].map((d) => d.id)).toEqual(['draft-001', 'draft-002'])
    })
  })
})
