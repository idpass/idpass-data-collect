import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MobileAuthStorage } from '../MobileAuthStorage'

describe('MobileAuthStorage', () => {
  let storage: MobileAuthStorage
  let mockLocalStorage: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })

    storage = new MobileAuthStorage('test-app-id')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Token Management', () => {
    it('should get token with provider and app ID', async () => {
      mockLocalStorage.getItem.mockReturnValue('test-token')

      const token = await storage.getToken('auth0', 'test-app-id')

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
      expect(token).toBe('test-token')
    })

    it('should get token with default app ID from constructor', async () => {
      mockLocalStorage.getItem.mockReturnValue('test-token')

      const token = await storage.getToken('auth0')

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
      expect(token).toBe('test-token')
    })

    it('should return empty string when no token found', async () => {
      mockLocalStorage.getItem.mockReturnValue(null)

      const token = await storage.getToken('auth0')

      expect(token).toBe('')
    })

    it('should set token with provider and app ID', async () => {
      await storage.setToken('new-token', 'keycloak', 'test-app-id')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token_app_test-app-id_keycloak', 'new-token')
    })

    it('should set token with default app ID from constructor', async () => {
      await storage.setToken('new-token', 'keycloak')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token_app_test-app-id_keycloak', 'new-token')
    })

    it('should remove token with provider and app ID', async () => {
      await storage.removeToken('auth0', 'test-app-id')

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
    })

    it('should remove token with default app ID from constructor', async () => {
      await storage.removeToken('auth0')

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token_app_test-app-id_auth0')
    })

    it('should handle token operations without provider', async () => {
      mockLocalStorage.getItem.mockReturnValue('generic-token')

      const token = await storage.getToken()
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('auth_token_app_test-app-id')
      expect(token).toBe('generic-token')

      await storage.setToken('new-generic-token')
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token_app_test-app-id', 'new-generic-token')

      await storage.removeToken()
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token_app_test-app-id')
    })
  })

  describe('OAuth Flow Management', () => {
    it('should save temporary OAuth data', () => {
      storage.saveTemporaryOAuthData('oauth-app-id', 'oauth-provider')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('temp_oauth_app_id', 'oauth-app-id')
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('temp_oauth_provider', 'oauth-provider')
    })

    it('should handle errors when saving temporary OAuth data', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      expect(() => {
        storage.saveTemporaryOAuthData('oauth-app-id', 'oauth-provider')
      }).not.toThrow()

      expect(console.warn).toHaveBeenCalledWith('Failed to save temporary OAuth data:', expect.any(Error))
    })

    it('should get temporary OAuth data', () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'temp_oauth_app_id') return 'stored-app-id'
        if (key === 'temp_oauth_provider') return 'stored-provider'
        return null
      })

      const data = storage.getTemporaryOAuthData()

      expect(data).toEqual({
        appId: 'stored-app-id',
        provider: 'stored-provider',
      })
    })

    it('should handle errors when getting temporary OAuth data', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      const data = storage.getTemporaryOAuthData()

      expect(data).toEqual({
        appId: null,
        provider: null,
      })
      expect(console.warn).toHaveBeenCalledWith('Failed to get temporary OAuth data:', expect.any(Error))
    })

    it('should clear temporary OAuth data', () => {
      storage.clearTemporaryOAuthData()

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('temp_oauth_app_id')
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('temp_oauth_provider')
    })

    it('should handle errors when clearing temporary OAuth data', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      expect(() => {
        storage.clearTemporaryOAuthData()
      }).not.toThrow()

      expect(console.warn).toHaveBeenCalledWith('Failed to clear temporary OAuth data:', expect.any(Error))
    })
  })

  describe('Provider Tracking', () => {
    it('should get last provider with app ID', () => {
      mockLocalStorage.getItem.mockReturnValue('last-provider')

      const provider = storage.getLastProvider('specific-app-id')

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('specific-app-id_last_provider')
      expect(provider).toBe('last-provider')
    })

    it('should get last provider with default app ID from constructor', () => {
      mockLocalStorage.getItem.mockReturnValue('last-provider')

      const provider = storage.getLastProvider()

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test-app-id_last_provider')
      expect(provider).toBe('last-provider')
    })

    it('should return null when no last provider found', () => {
      mockLocalStorage.getItem.mockReturnValue(null)

      const provider = storage.getLastProvider()

      expect(provider).toBeNull()
    })

    it('should return null when no app ID provided and no constructor app ID', () => {
      const storageWithoutAppId = new MobileAuthStorage()

      const provider = storageWithoutAppId.getLastProvider()

      expect(provider).toBeNull()
    })

    it('should handle errors when getting last provider', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      const provider = storage.getLastProvider()

      expect(provider).toBeNull()
      expect(console.warn).toHaveBeenCalledWith('Failed to get last provider:', expect.any(Error))
    })

    it('should set last provider with app ID', () => {
      storage.setLastProvider('new-provider', 'specific-app-id')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('specific-app-id_last_provider', 'new-provider')
    })

    it('should set last provider with default app ID from constructor', () => {
      storage.setLastProvider('new-provider')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test-app-id_last_provider', 'new-provider')
    })

    it('should not set last provider when no app ID provided and no constructor app ID', () => {
      const storageWithoutAppId = new MobileAuthStorage()

      storageWithoutAppId.setLastProvider('new-provider')

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('should handle errors when setting last provider', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      expect(() => {
        storage.setLastProvider('new-provider')
      }).not.toThrow()

      expect(console.warn).toHaveBeenCalledWith('Failed to set last provider:', expect.any(Error))
    })

    it('should clear last provider with app ID', () => {
      storage.clearLastProvider('specific-app-id')

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('specific-app-id_last_provider')
    })

    it('should clear last provider with default app ID from constructor', () => {
      storage.clearLastProvider()

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test-app-id_last_provider')
    })

    it('should not clear last provider when no app ID provided and no constructor app ID', () => {
      const storageWithoutAppId = new MobileAuthStorage()

      storageWithoutAppId.clearLastProvider()

      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled()
    })

    it('should handle errors when clearing last provider', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      expect(() => {
        storage.clearLastProvider()
      }).not.toThrow()

      expect(console.warn).toHaveBeenCalledWith('Failed to clear last provider:', expect.any(Error))
    })
  })

  describe('Key Generation', () => {
    it('should generate token key with app ID and provider', () => {
      const storage = new MobileAuthStorage('key-test-app')
      
      // Test private method through public method behavior
      storage.setToken('test-token', 'auth0')
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token_app_key-test-app_auth0', 'test-token')
    })

    it('should generate token key with app ID only', () => {
      const storage = new MobileAuthStorage('key-test-app')
      
      storage.setToken('test-token')
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token_app_key-test-app', 'test-token')
    })

    it('should generate provider key with app ID', () => {
      const storage = new MobileAuthStorage('key-test-app')
      
      storage.setLastProvider('test-provider')
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('key-test-app_last_provider', 'test-provider')
    })
  })
}) 