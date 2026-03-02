/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/services/SecureStorageService', () => ({
  SecureStorageService: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
}))

import { MobileAuthStorage } from '../MobileAuthStorage'
import { SecureStorageService } from '@/services/SecureStorageService'

describe('MobileAuthStorage', () => {
  let storage: MobileAuthStorage

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SecureStorageService.get).mockResolvedValue(null)
    vi.mocked(SecureStorageService.set).mockResolvedValue(undefined)
    vi.mocked(SecureStorageService.remove).mockResolvedValue(undefined)
    vi.mocked(SecureStorageService.clear).mockResolvedValue(undefined)

    storage = new MobileAuthStorage('test-app-id')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Token Management', () => {
    it('should get token with provider and app ID', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('test-token')

      const token = await storage.getToken('auth0', 'test-app-id')

      expect(SecureStorageService.get).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
      expect(token).toBe('test-token')
    })

    it('should get token with default app ID from constructor', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('test-token')

      const token = await storage.getToken('auth0')

      expect(SecureStorageService.get).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
      expect(token).toBe('test-token')
    })

    it('should return empty string when no token found', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue(null)

      const token = await storage.getToken('auth0')

      expect(token).toBe('')
    })

    it('should set token with provider and app ID', async () => {
      await storage.setToken('new-token', 'keycloak', 'test-app-id')

      expect(SecureStorageService.set).toHaveBeenCalledWith('auth_token_app_test-app-id_keycloak', 'new-token')
    })

    it('should set token with default app ID from constructor', async () => {
      await storage.setToken('new-token', 'keycloak')

      expect(SecureStorageService.set).toHaveBeenCalledWith('auth_token_app_test-app-id_keycloak', 'new-token')
    })

    it('should remove token with provider and app ID', async () => {
      await storage.removeToken('auth0', 'test-app-id')

      expect(SecureStorageService.remove).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
    })

    it('should remove token with default app ID from constructor', async () => {
      await storage.removeToken('auth0')

      expect(SecureStorageService.remove).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
    })

    it('should handle token operations without provider', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('generic-token')

      const token = await storage.getToken()
      expect(SecureStorageService.get).toHaveBeenCalledWith('auth_token_app_test-app-id')
      expect(token).toBe('generic-token')

      await storage.setToken('new-generic-token')
      expect(SecureStorageService.set).toHaveBeenCalledWith('auth_token_app_test-app-id', 'new-generic-token')

      await storage.removeToken()
      expect(SecureStorageService.remove).toHaveBeenCalledWith('auth_token_app_test-app-id')
    })
  })

  describe('OAuth Flow Management', () => {
    it('should save temporary OAuth data', async () => {
      await storage.saveTemporaryOAuthData('oauth-app-id', 'oauth-provider')

      expect(SecureStorageService.set).toHaveBeenCalledWith('temp_oauth_app_id', 'oauth-app-id')
      expect(SecureStorageService.set).toHaveBeenCalledWith('temp_oauth_provider', 'oauth-provider')
    })

    it('should handle errors when saving temporary OAuth data', async () => {
      vi.mocked(SecureStorageService.set).mockRejectedValue(new Error('Storage error'))

      await expect(storage.saveTemporaryOAuthData('oauth-app-id', 'oauth-provider')).resolves.toBeUndefined()

      expect(console.warn).toHaveBeenCalledWith('Failed to save temporary OAuth data:', expect.any(Error))
    })

    it('should get temporary OAuth data', async () => {
      vi.mocked(SecureStorageService.get).mockImplementation(async (key) => {
        if (key === 'temp_oauth_app_id') return 'stored-app-id'
        if (key === 'temp_oauth_provider') return 'stored-provider'
        return null
      })

      const data = await storage.getTemporaryOAuthData()

      expect(data).toEqual({
        appId: 'stored-app-id',
        provider: 'stored-provider',
      })
    })

    it('should handle errors when getting temporary OAuth data', async () => {
      vi.mocked(SecureStorageService.get).mockRejectedValue(new Error('Storage error'))

      const data = await storage.getTemporaryOAuthData()

      expect(data).toEqual({
        appId: null,
        provider: null,
      })
      expect(console.warn).toHaveBeenCalledWith('Failed to get temporary OAuth data:', expect.any(Error))
    })

    it('should clear temporary OAuth data', async () => {
      await storage.clearTemporaryOAuthData()

      expect(SecureStorageService.remove).toHaveBeenCalledWith('temp_oauth_app_id')
      expect(SecureStorageService.remove).toHaveBeenCalledWith('temp_oauth_provider')
    })

    it('should handle errors when clearing temporary OAuth data', async () => {
      vi.mocked(SecureStorageService.remove).mockRejectedValue(new Error('Storage error'))

      await expect(storage.clearTemporaryOAuthData()).resolves.toBeUndefined()

      expect(console.warn).toHaveBeenCalledWith('Failed to clear temporary OAuth data:', expect.any(Error))
    })
  })

  describe('Provider Tracking', () => {
    it('should get last provider with app ID', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('last-provider')

      const provider = await storage.getLastProvider('specific-app-id')

      expect(SecureStorageService.get).toHaveBeenCalledWith('specific-app-id_last_provider')
      expect(provider).toBe('last-provider')
    })

    it('should get last provider with default app ID from constructor', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue('last-provider')

      const provider = await storage.getLastProvider()

      expect(SecureStorageService.get).toHaveBeenCalledWith('test-app-id_last_provider')
      expect(provider).toBe('last-provider')
    })

    it('should return null when no last provider found', async () => {
      vi.mocked(SecureStorageService.get).mockResolvedValue(null)

      const provider = await storage.getLastProvider()

      expect(provider).toBeNull()
    })

    it('should return null when no app ID provided and no constructor app ID', async () => {
      const storageWithoutAppId = new MobileAuthStorage()

      const provider = await storageWithoutAppId.getLastProvider()

      expect(provider).toBeNull()
      expect(SecureStorageService.get).not.toHaveBeenCalled()
    })

    it('should handle errors when getting last provider', async () => {
      vi.mocked(SecureStorageService.get).mockRejectedValue(new Error('Storage error'))

      const provider = await storage.getLastProvider()

      expect(provider).toBeNull()
      expect(console.warn).toHaveBeenCalledWith('Failed to get last provider:', expect.any(Error))
    })

    it('should set last provider with app ID', async () => {
      await storage.setLastProvider('new-provider', 'specific-app-id')

      expect(SecureStorageService.set).toHaveBeenCalledWith('specific-app-id_last_provider', 'new-provider')
    })

    it('should set last provider with default app ID from constructor', async () => {
      await storage.setLastProvider('new-provider')

      expect(SecureStorageService.set).toHaveBeenCalledWith('test-app-id_last_provider', 'new-provider')
    })

    it('should not set last provider when no app ID provided and no constructor app ID', async () => {
      const storageWithoutAppId = new MobileAuthStorage()

      await storageWithoutAppId.setLastProvider('new-provider')

      expect(SecureStorageService.set).not.toHaveBeenCalled()
    })

    it('should handle errors when setting last provider', async () => {
      vi.mocked(SecureStorageService.set).mockRejectedValue(new Error('Storage error'))

      await expect(storage.setLastProvider('new-provider')).resolves.toBeUndefined()

      expect(console.warn).toHaveBeenCalledWith('Failed to set last provider:', expect.any(Error))
    })

    it('should clear last provider with app ID', async () => {
      await storage.clearLastProvider('specific-app-id')

      expect(SecureStorageService.remove).toHaveBeenCalledWith('specific-app-id_last_provider')
    })

    it('should clear last provider with default app ID from constructor', async () => {
      await storage.clearLastProvider()

      expect(SecureStorageService.remove).toHaveBeenCalledWith('test-app-id_last_provider')
    })

    it('should not clear last provider when no app ID provided and no constructor app ID', async () => {
      const storageWithoutAppId = new MobileAuthStorage()

      await storageWithoutAppId.clearLastProvider()

      expect(SecureStorageService.remove).not.toHaveBeenCalled()
    })

    it('should handle errors when clearing last provider', async () => {
      vi.mocked(SecureStorageService.remove).mockRejectedValue(new Error('Storage error'))

      await expect(storage.clearLastProvider()).resolves.toBeUndefined()

      expect(console.warn).toHaveBeenCalledWith('Failed to clear last provider:', expect.any(Error))
    })
  })

  describe('Key Generation', () => {
    it('should generate token key with app ID and provider', async () => {
      const s = new MobileAuthStorage('key-test-app')

      await s.setToken('test-token', 'auth0')

      expect(SecureStorageService.set).toHaveBeenCalledWith('auth_token_app_key-test-app_auth0', 'test-token')
    })

    it('should generate token key with app ID only', async () => {
      const s = new MobileAuthStorage('key-test-app')

      await s.setToken('test-token')

      expect(SecureStorageService.set).toHaveBeenCalledWith('auth_token_app_key-test-app', 'test-token')
    })

    it('should generate provider key with app ID', async () => {
      const s = new MobileAuthStorage('key-test-app')

      await s.setLastProvider('test-provider')

      expect(SecureStorageService.set).toHaveBeenCalledWith('key-test-app_last_provider', 'test-provider')
    })
  })
})
