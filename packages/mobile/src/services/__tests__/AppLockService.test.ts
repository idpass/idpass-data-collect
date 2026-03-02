/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
  },
}))

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(),
    authenticate: vi.fn(),
  },
  BiometryErrorType: {
    none: 'none',
    userCancel: 'userCancel',
    biometryNotAvailable: 'biometryNotAvailable',
    biometryNotEnrolled: 'biometryNotEnrolled',
  },
}))

vi.mock('@/services/SecureStorageService', () => ({
  SecureStorageService: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}))

import { Capacitor } from '@capacitor/core'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { SecureStorageService } from '@/services/SecureStorageService'

describe('AppLockService', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(SecureStorageService.get).mockResolvedValue(null)
    vi.mocked(SecureStorageService.set).mockResolvedValue(undefined)

    // Re-import the module fresh for each test to reset module-level state
    vi.resetModules()
  })

  describe('web platform (non-native)', () => {
    it('init sets locked to false on web', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      const { AppLockService } = await import('../AppLockService')

      await AppLockService.init()

      expect(AppLockService.locked.value).toBe(false)
    })

    it('authenticate returns true and unlocks on web', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      const { AppLockService } = await import('../AppLockService')

      const result = await AppLockService.authenticate()

      expect(result).toBe(true)
      expect(AppLockService.locked.value).toBe(false)
    })
  })

  describe('native platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('init reads persisted lock state — locked when stored value is "1"', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('1')
      const { AppLockService } = await import('../AppLockService')

      await AppLockService.init()

      expect(AppLockService.locked.value).toBe(true)
    })

    it('init reads persisted lock state — unlocked when stored value is "0"', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('0')
      const { AppLockService } = await import('../AppLockService')

      await AppLockService.init()

      expect(AppLockService.locked.value).toBe(false)
    })

    it('init defaults to locked when no persisted state', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue(null)
      const { AppLockService } = await import('../AppLockService')

      await AppLockService.init()

      expect(AppLockService.locked.value).toBe(true)
    })

    it('authenticate unlocks when biometry succeeds', async () => {
      vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
        isAvailable: true,
        deviceIsSecure: true,
        strongBiometryIsAvailable: true,
        biometryType: 3,
        biometryTypes: [3],
        reason: '',
        code: 'none',
      } as never)
      vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined)

      const { AppLockService } = await import('../AppLockService')
      const result = await AppLockService.authenticate()

      expect(result).toBe(true)
      expect(AppLockService.locked.value).toBe(false)
      expect(SecureStorageService.set).toHaveBeenCalledWith('app_lock_state', '0')
    })

    it('authenticate returns false when user cancels', async () => {
      vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
        isAvailable: true,
        deviceIsSecure: true,
        strongBiometryIsAvailable: true,
        biometryType: 3,
        biometryTypes: [3],
        reason: '',
        code: 'none',
      } as never)
      vi.mocked(BiometricAuth.authenticate).mockRejectedValue({ code: 'userCancel' })

      const { AppLockService } = await import('../AppLockService')
      const result = await AppLockService.authenticate()

      expect(result).toBe(false)
    })

    it('authenticate allows access when device has no screen lock', async () => {
      vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
        isAvailable: false,
        deviceIsSecure: false,
        strongBiometryIsAvailable: false,
        biometryType: 0,
        biometryTypes: [],
        reason: 'No biometry',
        code: 'biometryNotAvailable',
      } as never)

      const { AppLockService } = await import('../AppLockService')
      const result = await AppLockService.authenticate()

      expect(result).toBe(true)
      expect(AppLockService.locked.value).toBe(false)
    })

    it('lock sets locked to true and persists state', async () => {
      vi.mocked(BiometricAuth.checkBiometry).mockResolvedValue({
        isAvailable: true,
        deviceIsSecure: true,
        strongBiometryIsAvailable: true,
        biometryType: 3,
        biometryTypes: [3],
        reason: '',
        code: 'none',
      } as never)
      vi.mocked(BiometricAuth.authenticate).mockResolvedValue(undefined)

      const { AppLockService } = await import('../AppLockService')
      await AppLockService.authenticate()
      expect(AppLockService.locked.value).toBe(false)

      await AppLockService.lock()

      expect(AppLockService.locked.value).toBe(true)
      expect(SecureStorageService.set).toHaveBeenCalledWith('app_lock_state', '1')
    })
  })
})
