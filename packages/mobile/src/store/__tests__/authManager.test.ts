/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthManagerStore } from '../authManager'
import { useTenantStore } from '../tenant'
import { MobileAuthStorage } from '@/authentication/MobileAuthStorage'
import router from '@/router'

// Mock global IndexedDB API
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: vi.fn(),
    deleteDatabase: vi.fn(),
    databases: vi.fn(),
  },
  writable: true,
})

// Mock dependencies
vi.mock('@/authentication/MobileAuthStorage')
vi.mock('@/store/tenant')
vi.mock('@/utils/device')
vi.mock('@/utils/getSyncServerByAppId')
vi.mock('@capacitor/app')
vi.mock('@/router', () => ({
  default: {
    push: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock IndexedDB-related modules from idpass-data-collect with proper implementations
vi.mock('@idpass/data-collect-core', () => ({
  AuthConfig: vi.fn().mockImplementation(() => ({})),
  AuthManager: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn().mockResolvedValue(false),
    handleCallback: vi.fn(),
  })),
  EntityDataManager: vi.fn().mockImplementation(() => ({})),
  EntityStoreImpl: vi.fn().mockImplementation(() => ({})),
  EventStoreImpl: vi.fn().mockImplementation(() => ({})),
  IndexedDbEventStorageAdapter: vi.fn().mockImplementation(() => ({})),
  IndexedDbEntityStorageAdapter: vi.fn().mockImplementation(() => ({})),
  EventApplierService: vi.fn().mockImplementation(() => ({})),
  InternalSyncManager: vi.fn().mockImplementation(() => ({})),
  IndexedDbAuthStorageAdapter: vi.fn().mockImplementation(() => ({})),
}))

// Mock the store index properly - all variables must be inside the factory
vi.mock('@/store/index', () => {
  // Create mock functions inside the factory to avoid hoisting issues
  const mockLogin = vi.fn().mockResolvedValue(undefined)
  const mockLogout = vi.fn().mockResolvedValue(undefined)
  const mockIsAuthenticated = vi.fn().mockResolvedValue(false)
  const mockHandleCallback = vi.fn().mockResolvedValue(undefined)
  const mockInitStore = vi.fn().mockResolvedValue(undefined)
  const mockCloseStore = vi.fn().mockResolvedValue(undefined)

  // Create the mock store object
  const mockStoreObject = {
    login: mockLogin,
    logout: mockLogout,
    isAuthenticated: mockIsAuthenticated,
    handleCallback: mockHandleCallback,
  }

  return {
    initStore: mockInitStore,
    store: mockStoreObject,
    closeStore: mockCloseStore,
    saveRefreshTokenForReauth: vi.fn().mockResolvedValue(undefined),
    clearRefreshTokenForReauth: vi.fn().mockResolvedValue(undefined),
  }
})

// Import the mocked module to get access to the mocked functions
import { store as mockStore } from '@/store/index'

describe('AuthManager Store', () => {
  let authManagerStore: ReturnType<typeof useAuthManagerStore>
  let mockTenantStore: Record<string, ReturnType<typeof vi.fn>>
  let mockMobileAuthStorage: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    setActivePinia(createPinia())
    authManagerStore = useAuthManagerStore()

    // Setup mocks
    mockTenantStore = {
      getTenant: vi.fn(),
    }
    vi.mocked(useTenantStore).mockReturnValue(mockTenantStore as unknown as ReturnType<typeof useTenantStore>)

    mockMobileAuthStorage = {
      getLastProvider: vi.fn().mockResolvedValue(null),
      setLastProvider: vi.fn().mockResolvedValue(undefined),
      clearLastProvider: vi.fn().mockResolvedValue(undefined),
      saveTemporaryOAuthData: vi.fn().mockResolvedValue(undefined),
      clearTemporaryOAuthData: vi.fn().mockResolvedValue(undefined),
      getTemporaryOAuthData: vi.fn().mockResolvedValue({ appId: null, provider: null }),
    }
    vi.mocked(MobileAuthStorage).mockImplementation(() => mockMobileAuthStorage as unknown as MobileAuthStorage)

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })

    // Mock utility functions
    vi.doMock('@/utils/device', () => ({
      detectPlatform: vi.fn().mockReturnValue('web'),
    }))

    vi.doMock('@/utils/getSyncServerByAppId', () => ({
      getSyncServerUrlByAppId: vi.fn().mockResolvedValue('http://localhost:3000'),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      expect(authManagerStore.authManager).toBeNull()
      expect(authManagerStore.mobileAuthStorage).toBeNull()
      expect(authManagerStore.isLoading).toBe(false)
      expect(authManagerStore.error).toBeNull()
      expect(authManagerStore.isInitialized).toBe(false)
      expect(authManagerStore.isAuthenticated).toBe(false)
      expect(authManagerStore.currentProvider).toBeNull()
      expect(authManagerStore.availableProviders).toEqual([])
      expect(authManagerStore.appId).toBeNull()
    })
  })

  describe('initialize', () => {
    const mockTenant = {
      _data: {
        authConfigs: [
          { type: 'auth0', fields: {} },
          { type: 'keycloak', fields: {} },
        ],
      },
    }

    beforeEach(() => {
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)
      mockMobileAuthStorage.getLastProvider.mockResolvedValue('auth0')
    })

    it('should initialize successfully', async () => {
      await authManagerStore.initialize('test-app-id')

      expect(authManagerStore.isLoading).toBe(false)
      expect(authManagerStore.error).toBeNull()
      expect(authManagerStore.isInitialized).toBe(true)
      expect(authManagerStore.appId).toBe('test-app-id')
      expect(authManagerStore.availableProviders).toEqual(['auth0', 'keycloak'])
      expect(authManagerStore.currentProvider).toBe('auth0')
      expect(authManagerStore.isAuthenticated).toBe(true)
    })

    it('should set loading state during initialization', async () => {
      const initPromise = authManagerStore.initialize('test-app-id')
      expect(authManagerStore.isLoading).toBe(true)
      await initPromise
      expect(authManagerStore.isLoading).toBe(false)
    })

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed')
      mockTenantStore.getTenant.mockRejectedValue(error)

      await expect(authManagerStore.initialize('test-app-id')).rejects.toThrow('Initialization failed')
      
      expect(authManagerStore.error).toBe('Initialization failed')
      expect(authManagerStore.isInitialized).toBe(false)
      expect(authManagerStore.isLoading).toBe(false)
    })

    it('should handle tenant without auth configs', async () => {
      mockTenantStore.getTenant.mockResolvedValue({ _data: {} })
      mockMobileAuthStorage.getLastProvider.mockResolvedValue(null)

      await authManagerStore.initialize('test-app-id')

      expect(authManagerStore.availableProviders).toEqual([])
      expect(authManagerStore.currentProvider).toBeNull()
    })
  })

  describe('login', () => {
    beforeEach(async () => {
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)
      await authManagerStore.initialize('test-app-id')
    })

    it('should login successfully with provider', async () => {
      await authManagerStore.login('auth0')

      expect(vi.mocked(mockStore.login)).toHaveBeenCalledWith(null, 'auth0')
      expect(mockMobileAuthStorage.saveTemporaryOAuthData).toHaveBeenCalledWith('test-app-id', 'auth0')
      expect(authManagerStore.isAuthenticated).toBe(true)
      expect(authManagerStore.currentProvider).toBe('auth0')
    })

    it('should login successfully with credentials', async () => {
      const credentials = { username: 'test@example.com', password: 'password' }
      
      await authManagerStore.login(null, credentials)

      expect(vi.mocked(mockStore.login)).toHaveBeenCalledWith(credentials, null)
      expect(authManagerStore.isAuthenticated).toBe(true)
    })

    it('should handle login errors', async () => {
      const error = new Error('Login failed')
      vi.mocked(mockStore.login).mockRejectedValue(error)

      await expect(authManagerStore.login('auth0')).rejects.toThrow('Login failed')
      
      expect(authManagerStore.error).toBe('Login failed')
      expect(mockMobileAuthStorage.clearTemporaryOAuthData).toHaveBeenCalled()
    })

    it('should throw error if not initialized', async () => {
      authManagerStore.$reset()

      await expect(authManagerStore.login('auth0')).rejects.toThrow('Auth system not initialized')
    })
  })

  describe('logout', () => {
    beforeEach(async () => {
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)
      await authManagerStore.initialize('test-app-id')
    })

    it('should logout successfully', async () => {
      await authManagerStore.logout('test-app-id')

      expect(vi.mocked(mockStore.logout)).toHaveBeenCalled()
      expect(authManagerStore.isAuthenticated).toBe(false)
      expect(authManagerStore.currentProvider).toBeNull()
      expect(mockMobileAuthStorage.clearLastProvider).toHaveBeenCalledWith('test-app-id')
    })

    it('should handle logout errors', async () => {
      const error = new Error('Logout failed')
      vi.mocked(mockStore.logout).mockRejectedValue(error)

      await expect(authManagerStore.logout('test-app-id')).rejects.toThrow('Logout failed')
      
      expect(authManagerStore.error).toBe('Logout failed')
    })

    it('should return early if authManager is null', async () => {
      authManagerStore.$reset()

      await authManagerStore.logout('test-app-id')

      expect(vi.mocked(mockStore.logout)).not.toHaveBeenCalled()
    })
  })

  describe('handleCallback', () => {
    beforeEach(async () => {
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)
      await authManagerStore.initialize('test-app-id')
      
      mockMobileAuthStorage.getTemporaryOAuthData.mockResolvedValue({
        appId: 'test-app-id',
        provider: 'auth0',
      })
    })

    it('should handle callback successfully', async () => {
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)

      await authManagerStore.handleCallback()

      expect(vi.mocked(mockStore.handleCallback)).toHaveBeenCalledWith('auth0')
      expect(mockMobileAuthStorage.setLastProvider).toHaveBeenCalledWith('auth0', 'test-app-id')
      expect(authManagerStore.currentProvider).toBe('auth0')
      expect(mockMobileAuthStorage.clearTemporaryOAuthData).toHaveBeenCalled()
    })

    it('should handle callback errors', async () => {
      const error = new Error('Callback failed')
      vi.mocked(mockStore.handleCallback).mockRejectedValue(error)

      await expect(authManagerStore.handleCallback()).rejects.toThrow('Callback failed')
      
      expect(authManagerStore.error).toBe('Callback failed')
    })

    it('should throw error if no provider available', async () => {
      mockMobileAuthStorage.getTemporaryOAuthData.mockResolvedValue({
        appId: 'test-app-id',
        provider: null,
      })

      await expect(authManagerStore.handleCallback()).rejects.toThrow('No provider available for callback handling')
    })

    it('should throw error if not initialized', async () => {
      authManagerStore.$reset()

      await expect(authManagerStore.handleCallback()).rejects.toThrow('Auth system not initialized')
    })
  })

  describe('handleDefaultLogin', () => {
    beforeEach(async () => {
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)
      await authManagerStore.initialize('test-app-id')
    })

    it('should handle default login when authenticated', async () => {
      await authManagerStore.handleDefaultLogin()

      expect(mockMobileAuthStorage.setLastProvider).toHaveBeenCalledWith('default', 'test-app-id')
      expect(router.replace).toHaveBeenCalledWith('/app/test-app-id')
    })

    it('should not redirect if not authenticated', async () => {
      // Initialize with isAuthenticated returning false to land in unauthenticated state
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)
      authManagerStore.$reset()
      const mockTenantForThis = {
        _data: { authConfigs: [{ type: 'auth0', fields: {} }] },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenantForThis)
      await authManagerStore.initialize('test-app-id')

      mockMobileAuthStorage.setLastProvider.mockClear()
      await authManagerStore.handleDefaultLogin()

      expect(mockMobileAuthStorage.setLastProvider).not.toHaveBeenCalled()
    })
  })

  describe('refreshAuthenticationState', () => {
    beforeEach(async () => {
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)
      await authManagerStore.initialize('test-app-id')
    })

    it('should refresh authentication state when authenticated', async () => {
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)
      mockMobileAuthStorage.getLastProvider.mockResolvedValue('auth0')

      await authManagerStore.refreshAuthenticationState()

      expect(authManagerStore.isAuthenticated).toBe(true)
      expect(authManagerStore.currentProvider).toBe('auth0')
    })

    it('should refresh authentication state when not authenticated', async () => {
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)

      await authManagerStore.refreshAuthenticationState()

      expect(authManagerStore.isAuthenticated).toBe(false)
      expect(authManagerStore.currentProvider).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(mockStore.isAuthenticated).mockRejectedValue(new Error('Auth check failed'))

      // Should not throw — XState handles the error via onError transition
      await authManagerStore.refreshAuthenticationState()

      // Machine stays in unauthenticated state (graceful error handling)
      expect(authManagerStore.isAuthenticated).toBe(false)
    })
  })

  describe('checkAuthenticationStatus', () => {
    const mockTenant = {
      _data: {
        authConfigs: [{ type: 'auth0', fields: {} }],
      },
    }

    beforeEach(() => {
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
    })

    it('should return authentication status when authenticated', async () => {
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)

      const result = await authManagerStore.checkAuthenticationStatus('test-app-id')

      expect(result.isAuthenticated).toBe(true)
      expect(result.authManager).toBeDefined()
      expect(result.authStorage).toBeDefined()
      expect(result.tenant).toBe(mockTenant)
    })

    it('should return authentication status when not authenticated', async () => {
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(false)

      const result = await authManagerStore.checkAuthenticationStatus('test-app-id')

      expect(result.isAuthenticated).toBe(false)
      expect(result.authManager).toBeDefined()
      expect(result.authStorage).toBeDefined()
    })

    it('should handle missing tenant', async () => {
      mockTenantStore.getTenant.mockResolvedValue(null)

      const result = await authManagerStore.checkAuthenticationStatus('test-app-id')

      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBe('No tenant configuration found')
    })

    it('should handle errors', async () => {
      mockTenantStore.getTenant.mockRejectedValue(new Error('Tenant fetch failed'))

      const result = await authManagerStore.checkAuthenticationStatus('test-app-id')

      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBe('Tenant fetch failed')
    })
  })


  describe('getTemporaryOAuthData', () => {
    it('should get temporary OAuth data from storage', async () => {
      const mockData = { appId: 'test-app-id', provider: 'auth0' }
      mockMobileAuthStorage.getTemporaryOAuthData.mockResolvedValue(mockData)

      const result = await authManagerStore.getTemporaryOAuthData()

      expect(result).toEqual(mockData)
    })

    it('should create temporary storage if none exists', async () => {
      // Reset to clear mobileAuthStorage from context
      authManagerStore.$reset()
      const mockData = { appId: 'test-app-id', provider: 'auth0' }
      mockMobileAuthStorage.getTemporaryOAuthData.mockResolvedValue(mockData)

      const result = await authManagerStore.getTemporaryOAuthData()

      expect(result).toEqual(mockData)
    })
  })

  describe('$reset', () => {
    it('should reset all state to initial values', async () => {
      // First initialize the store
      const mockTenant = {
        _data: {
          authConfigs: [{ type: 'auth0', fields: {} }],
        },
      }
      mockTenantStore.getTenant.mockResolvedValue(mockTenant)
      vi.mocked(mockStore.isAuthenticated).mockResolvedValue(true)
      await authManagerStore.initialize('test-app-id')

      // Verify state is set
      expect(authManagerStore.isInitialized).toBe(true)
      expect(authManagerStore.appId).toBe('test-app-id')

      // Reset the store
      authManagerStore.$reset()

      // Verify all state is reset
      expect(authManagerStore.authManager).toBeNull()
      expect(authManagerStore.mobileAuthStorage).toBeNull()
      expect(authManagerStore.isLoading).toBe(false)
      expect(authManagerStore.error).toBeNull()
      expect(authManagerStore.isInitialized).toBe(false)
      expect(authManagerStore.isAuthenticated).toBe(false)
      expect(authManagerStore.currentProvider).toBeNull()
      expect(authManagerStore.availableProviders).toEqual([])
      expect(authManagerStore.appId).toBeNull()
    })
  })
}) 