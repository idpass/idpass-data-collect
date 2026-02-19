import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { User } from 'oidc-client-ts'

// Mock oidc-client-ts before importing the store
const mockGetUser = vi.fn()
const mockSigninRedirect = vi.fn()
const mockSigninRedirectCallback = vi.fn()
const mockSignoutRedirect = vi.fn()
const mockAddUserLoaded = vi.fn()
const mockAddUserUnloaded = vi.fn()

const mockUserManagerInstance = {
  getUser: mockGetUser,
  signinRedirect: mockSigninRedirect,
  signinRedirectCallback: mockSigninRedirectCallback,
  signoutRedirect: mockSignoutRedirect,
  events: {
    addUserLoaded: mockAddUserLoaded,
    addUserUnloaded: mockAddUserUnloaded,
  },
}

vi.mock('oidc-client-ts', () => ({
  UserManager: vi.fn(() => mockUserManagerInstance),
  WebStorageStateStore: vi.fn(),
}))

// Import store after mock setup
import { useAuthStore } from '@/stores/auth'

const makeMockUser = (overrides: Partial<User> = {}): User =>
  ({
    access_token: 'test-access-token',
    token_type: 'Bearer',
    profile: {
      sub: 'user-123',
      name: 'Test User',
      preferred_username: 'testuser',
      email: 'test@example.com',
      iss: 'https://keycloak.example.com',
      aud: 'portal-client',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    expired: false,
    scopes: ['openid', 'profile', 'email'],
    toStorageString: vi.fn(),
    ...overrides,
  }) as unknown as User

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset module-level userManagerInstance between tests by reimporting
  })

  describe('initial state', () => {
    it('starts with no user', () => {
      const store = useAuthStore()
      expect(store.user).toBeNull()
    })

    it('starts as not authenticated', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
    })

    it('starts with null access token', () => {
      const store = useAuthStore()
      expect(store.accessToken).toBeNull()
    })

    it('starts with empty display name', () => {
      const store = useAuthStore()
      expect(store.displayName).toBe('')
    })

    it('starts with null email', () => {
      const store = useAuthStore()
      expect(store.email).toBeNull()
    })

    it('starts not loading', () => {
      const store = useAuthStore()
      expect(store.isLoading).toBe(false)
    })

    it('starts with no error', () => {
      const store = useAuthStore()
      expect(store.error).toBeNull()
    })
  })

  describe('initialize()', () => {
    it('sets user to null when no session exists', async () => {
      mockGetUser.mockResolvedValue(null)
      const store = useAuthStore()

      await store.initialize()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('sets user when session exists', async () => {
      const mockUser = makeMockUser()
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.user).toEqual(mockUser)
      expect(store.isAuthenticated).toBe(true)
    })

    it('registers userLoaded event handler', async () => {
      mockGetUser.mockResolvedValue(null)
      const store = useAuthStore()

      await store.initialize()

      expect(mockAddUserLoaded).toHaveBeenCalledOnce()
    })

    it('registers userUnloaded event handler', async () => {
      mockGetUser.mockResolvedValue(null)
      const store = useAuthStore()

      await store.initialize()

      expect(mockAddUserUnloaded).toHaveBeenCalledOnce()
    })

    it('sets error on failure', async () => {
      mockGetUser.mockRejectedValue(new Error('Storage error'))
      const store = useAuthStore()

      await store.initialize()

      expect(store.error).toBe('Storage error')
      expect(store.user).toBeNull()
    })

    it('clears loading state after completion', async () => {
      mockGetUser.mockResolvedValue(null)
      const store = useAuthStore()

      await store.initialize()

      expect(store.isLoading).toBe(false)
    })
  })

  describe('signIn()', () => {
    it('calls userManager.signinRedirect()', async () => {
      mockSigninRedirect.mockResolvedValue(undefined)
      const store = useAuthStore()

      await store.signIn()

      expect(mockSigninRedirect).toHaveBeenCalledOnce()
    })

    it('sets error on failure', async () => {
      mockSigninRedirect.mockRejectedValue(new Error('Redirect failed'))
      const store = useAuthStore()

      await store.signIn()

      expect(store.error).toBe('Redirect failed')
    })
  })

  describe('handleCallback()', () => {
    it('calls userManager.signinRedirectCallback()', async () => {
      const mockUser = makeMockUser()
      mockSigninRedirectCallback.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.handleCallback()

      expect(mockSigninRedirectCallback).toHaveBeenCalledOnce()
    })

    it('sets user after successful callback', async () => {
      const mockUser = makeMockUser()
      mockSigninRedirectCallback.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.handleCallback()

      expect(store.user).toEqual(mockUser)
      expect(store.isAuthenticated).toBe(true)
    })

    it('throws and sets error on callback failure', async () => {
      mockSigninRedirectCallback.mockRejectedValue(new Error('Invalid state'))
      const store = useAuthStore()

      await expect(store.handleCallback()).rejects.toThrow('Invalid state')
      expect(store.error).toBe('Invalid state')
    })
  })

  describe('signOut()', () => {
    it('calls userManager.signoutRedirect()', async () => {
      mockSignoutRedirect.mockResolvedValue(undefined)
      const store = useAuthStore()

      await store.signOut()

      expect(mockSignoutRedirect).toHaveBeenCalledOnce()
    })

    it('sets error on failure', async () => {
      mockSignoutRedirect.mockRejectedValue(new Error('Sign out failed'))
      const store = useAuthStore()

      await store.signOut()

      expect(store.error).toBe('Sign out failed')
    })
  })

  describe('accessToken computed', () => {
    it('returns null when no user', () => {
      const store = useAuthStore()
      expect(store.accessToken).toBeNull()
    })

    it('returns token when user exists', async () => {
      const mockUser = makeMockUser({ access_token: 'my-token-value' })
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.accessToken).toBe('my-token-value')
    })
  })

  describe('displayName computed', () => {
    it('returns empty string when no user', () => {
      const store = useAuthStore()
      expect(store.displayName).toBe('')
    })

    it('returns profile name when available', async () => {
      const mockUser = makeMockUser()
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.displayName).toBe('Test User')
    })

    it('falls back to preferred_username when name is missing', async () => {
      const mockUser = makeMockUser()
      mockUser.profile = { ...mockUser.profile, name: undefined, preferred_username: 'johndoe' }
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.displayName).toBe('johndoe')
    })

    it('falls back to email when name and preferred_username are missing', async () => {
      const mockUser = makeMockUser()
      mockUser.profile = {
        ...mockUser.profile,
        name: undefined,
        preferred_username: undefined,
        email: 'fallback@example.com',
      }
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.displayName).toBe('fallback@example.com')
    })
  })

  describe('getAccessToken()', () => {
    it('returns null when not authenticated', () => {
      const store = useAuthStore()
      expect(store.getAccessToken()).toBeNull()
    })

    it('returns access token when user is set', async () => {
      const mockUser = makeMockUser({ access_token: 'bearer-xyz' })
      mockGetUser.mockResolvedValue(mockUser)
      const store = useAuthStore()

      await store.initialize()

      expect(store.getAccessToken()).toBe('bearer-xyz')
    })
  })
})
