/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>()
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: vi.fn().mockReturnValue(false),
    },
  }
})

vi.mock('@/shims/secure-storage', () => ({
  SecureStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
}))

import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@/shims/secure-storage'
import { SecureStorageService } from '../SecureStorageService'

describe('SecureStorageService', () => {
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  describe('web fallback (non-native platform)', () => {
    it('get delegates to localStorage.getItem', async () => {
      mockLocalStorage.getItem.mockReturnValue('stored-value')

      const result = await SecureStorageService.get('my-key')

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('my-key')
      expect(result).toBe('stored-value')
    })

    it('get returns null when key is missing', async () => {
      mockLocalStorage.getItem.mockReturnValue(null)

      const result = await SecureStorageService.get('missing-key')

      expect(result).toBeNull()
    })

    it('set delegates to localStorage.setItem', async () => {
      await SecureStorageService.set('my-key', 'my-value')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('my-key', 'my-value')
    })

    it('remove delegates to localStorage.removeItem', async () => {
      await SecureStorageService.remove('my-key')

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('my-key')
    })

    it('clear delegates to localStorage.clear', async () => {
      await SecureStorageService.clear()

      expect(mockLocalStorage.clear).toHaveBeenCalled()
    })
  })

  describe('native platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('get delegates to SecureStorage.getItem', async () => {
      vi.mocked(SecureStorage.getItem).mockResolvedValue('native-value')

      const result = await SecureStorageService.get('my-key')

      expect(SecureStorage.getItem).toHaveBeenCalledWith('my-key')
      expect(result).toBe('native-value')
    })

    it('get returns null when SecureStorage throws', async () => {
      vi.mocked(SecureStorage.getItem).mockRejectedValue(new Error('not found'))

      const result = await SecureStorageService.get('missing-key')

      expect(result).toBeNull()
    })

    it('set delegates to SecureStorage.setItem', async () => {
      vi.mocked(SecureStorage.setItem).mockResolvedValue(undefined)

      await SecureStorageService.set('my-key', 'my-value')

      expect(SecureStorage.setItem).toHaveBeenCalledWith('my-key', 'my-value')
    })

    it('remove delegates to SecureStorage.remove', async () => {
      vi.mocked(SecureStorage.remove).mockResolvedValue(true)

      await SecureStorageService.remove('my-key')

      expect(SecureStorage.remove).toHaveBeenCalledWith('my-key')
    })

    it('remove does not throw when key does not exist', async () => {
      vi.mocked(SecureStorage.remove).mockRejectedValue(new Error('not found'))

      await expect(SecureStorageService.remove('missing-key')).resolves.toBeUndefined()
    })

    it('clear delegates to SecureStorage.clear', async () => {
      vi.mocked(SecureStorage.clear).mockResolvedValue(undefined)

      await SecureStorageService.clear()

      expect(SecureStorage.clear).toHaveBeenCalled()
    })
  })
})
