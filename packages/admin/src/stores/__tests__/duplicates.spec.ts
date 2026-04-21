import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDuplicatesStore } from '../duplicates'

const mockGetPotentialDuplicates = vi.fn()
const mockResolveDuplicate = vi.fn()

vi.mock('@/api', () => ({
  getPotentialDuplicates: (...args: unknown[]) => mockGetPotentialDuplicates(...args),
  resolveDuplicate: (...args: unknown[]) => mockResolveDuplicate(...args),
}))

describe('duplicates store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchDuplicates', () => {
    it('loads duplicates and sets state', async () => {
      const duplicates = [
        { entityGuid: 'entity-1', duplicateGuid: 'entity-2' },
        { entityGuid: 'entity-3', duplicateGuid: 'entity-4' },
      ]
      mockGetPotentialDuplicates.mockResolvedValue(duplicates)

      const store = useDuplicatesStore()
      await store.fetchDuplicates('config-1')

      expect(mockGetPotentialDuplicates).toHaveBeenCalledWith('config-1')
      expect(store.duplicates).toEqual(duplicates)
      expect(store.loading).toBe(false)
    })

    it('sets loading to true during fetch and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockGetPotentialDuplicates.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
      )

      const store = useDuplicatesStore()
      const fetchPromise = store.fetchDuplicates('config-1')

      expect(store.loading).toBe(true)

      resolvePromise!([])
      await fetchPromise

      expect(store.loading).toBe(false)
    })

    it('sets loading to false even when API throws', async () => {
      mockGetPotentialDuplicates.mockRejectedValue(new Error('Network error'))

      const store = useDuplicatesStore()
      await expect(store.fetchDuplicates('config-1')).rejects.toThrow('Network error')

      expect(store.loading).toBe(false)
    })

    it('replaces previous duplicates with fresh data', async () => {
      const firstBatch = [{ entityGuid: 'entity-1', duplicateGuid: 'entity-2' }]
      const secondBatch = [{ entityGuid: 'entity-3', duplicateGuid: 'entity-4' }]

      mockGetPotentialDuplicates.mockResolvedValueOnce(firstBatch)
      const store = useDuplicatesStore()
      await store.fetchDuplicates('config-1')
      expect(store.duplicates).toEqual(firstBatch)

      mockGetPotentialDuplicates.mockResolvedValueOnce(secondBatch)
      await store.fetchDuplicates('config-1')
      expect(store.duplicates).toEqual(secondBatch)
    })
  })

  describe('resolve', () => {
    it('calls API with correct parameters and refreshes duplicates', async () => {
      const duplicates = [
        { entityGuid: 'entity-1', duplicateGuid: 'entity-2' },
        { entityGuid: 'entity-3', duplicateGuid: 'entity-4' },
      ]
      mockGetPotentialDuplicates.mockResolvedValue(duplicates)
      mockResolveDuplicate.mockResolvedValue({ status: 'ok' })

      const store = useDuplicatesStore()
      await store.fetchDuplicates('config-1')
      vi.clearAllMocks()

      const refreshedDuplicates = [{ entityGuid: 'entity-3', duplicateGuid: 'entity-4' }]
      mockResolveDuplicate.mockResolvedValue({ status: 'ok' })
      mockGetPotentialDuplicates.mockResolvedValue(refreshedDuplicates)

      const resolveParams = {
        newItem: 'entity-2',
        existingItem: 'entity-1',
        shouldDeleteNewItem: true,
        configId: 'config-1',
      }

      await store.resolve(resolveParams)

      expect(mockResolveDuplicate).toHaveBeenCalledWith(resolveParams)
      expect(mockGetPotentialDuplicates).toHaveBeenCalledWith('config-1')
      expect(store.duplicates).toEqual(refreshedDuplicates)
    })

    it('still refreshes duplicates when resolve succeeds', async () => {
      mockResolveDuplicate.mockResolvedValue({ status: 'ok' })
      mockGetPotentialDuplicates.mockResolvedValue([])

      const store = useDuplicatesStore()
      await store.resolve({
        newItem: 'a',
        existingItem: 'b',
        shouldDeleteNewItem: false,
        configId: 'config-1',
      })

      expect(mockGetPotentialDuplicates).toHaveBeenCalledWith('config-1')
    })
  })
})
