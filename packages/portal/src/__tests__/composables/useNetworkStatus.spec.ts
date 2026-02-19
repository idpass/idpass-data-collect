import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the notification store
const mockShowNotification = vi.fn()
vi.mock('@/stores/notification', () => ({
  useNotificationStore: vi.fn(() => ({
    showNotification: mockShowNotification,
  })),
}))

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

import { useNetworkStatus } from '@/composables/useNetworkStatus'

describe('useNetworkStatus', () => {
  let originalOnLine: PropertyDescriptor | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Save original descriptor
    originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  })

  afterEach(() => {
    // Restore original descriptor
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine)
    }
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('returns true for isOnline when navigator.onLine is true', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      })

      const { isOnline } = useNetworkStatus()
      expect(isOnline.value).toBe(true)
    })

    it('returns false for isOnline when navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      })

      const { isOnline } = useNetworkStatus()
      expect(isOnline.value).toBe(false)
    })
  })

  describe('event handling', () => {
    it('updates isOnline to false when offline event fires', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      })

      const { isOnline } = useNetworkStatus()
      expect(isOnline.value).toBe(true)

      window.dispatchEvent(new Event('offline'))
      expect(isOnline.value).toBe(false)
    })

    it('updates isOnline to true when online event fires', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      })

      const { isOnline } = useNetworkStatus()
      expect(isOnline.value).toBe(false)

      window.dispatchEvent(new Event('online'))
      expect(isOnline.value).toBe(true)
    })

    it('shows offline notification when going offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      })

      useNetworkStatus()

      window.dispatchEvent(new Event('offline'))

      expect(mockShowNotification).toHaveBeenCalledWith(
        'errors.offline',
        'warning',
      )
    })

    it('shows back-online notification when coming back online', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      })

      useNetworkStatus()

      window.dispatchEvent(new Event('online'))

      expect(mockShowNotification).toHaveBeenCalledWith(
        'errors.backOnline',
        'success',
      )
    })
  })

  describe('return value', () => {
    it('returns an object with isOnline ref', () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      })

      const result = useNetworkStatus()
      expect(result).toHaveProperty('isOnline')
      expect(typeof result.isOnline.value).toBe('boolean')
    })
  })
})
