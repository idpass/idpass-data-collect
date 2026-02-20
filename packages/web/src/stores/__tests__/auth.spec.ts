import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

// Mock the API module
vi.mock('@/api/auth', () => ({
  loginAgent: vi.fn(),
  refreshToken: vi.fn(),
}))

function createMockJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = 'mock-signature'
  return `${header}.${body}.${signature}`
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts unauthenticated', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
      expect(store.userType).toBeNull()
      expect(store.token).toBeNull()
      expect(store.agentPayload).toBeNull()
      expect(store.citizenPayload).toBeNull()
    })

    it('is not agent or citizen initially', () => {
      const store = useAuthStore()
      expect(store.isAgent).toBe(false)
      expect(store.isCitizen).toBe(false)
      expect(store.isAdmin).toBe(false)
    })
  })

  describe('loginAsAgent', () => {
    it('sets agent state on successful login', async () => {
      const { loginAgent } = await import('@/api/auth')
      const mockToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        role: 'ADMIN',
        tenantIds: ['tenant-1'],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.mocked(loginAgent).mockResolvedValueOnce({ token: mockToken })

      const store = useAuthStore()
      const result = await store.loginAsAgent({ email: 'agent@test.com', password: 'pass' })

      expect(result).toBe(true)
      expect(store.isAuthenticated).toBe(true)
      expect(store.isAgent).toBe(true)
      expect(store.isCitizen).toBe(false)
      expect(store.userType).toBe('agent')
      expect(store.agentPayload?.email).toBe('agent@test.com')
      expect(store.isAdmin).toBe(true)
    })

    it('returns false on failed login', async () => {
      const { loginAgent } = await import('@/api/auth')
      vi.mocked(loginAgent).mockRejectedValueOnce(new Error('Unauthorized'))

      const store = useAuthStore()
      const result = await store.loginAsAgent({ email: 'bad@test.com', password: 'wrong' })

      expect(result).toBe(false)
      expect(store.isAuthenticated).toBe(false)
    })

    it('stores agent token in localStorage', async () => {
      const { loginAgent } = await import('@/api/auth')
      const mockToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.mocked(loginAgent).mockResolvedValueOnce({ token: mockToken })

      const store = useAuthStore()
      await store.loginAsAgent({ email: 'agent@test.com', password: 'pass' })

      expect(localStorage.getItem('web_token')).toBe(mockToken)
      expect(localStorage.getItem('web_user_type')).toBe('agent')
    })
  })

  describe('loginAsCitizen', () => {
    it('sets citizen state', () => {
      const mockToken = createMockJwt({
        scope: 'self-service',
        identifier: 'entity-123',
        entityGuid: 'entity-123',
        tenantId: 'tenant-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const store = useAuthStore()
      store.loginAsCitizen(mockToken)

      expect(store.isAuthenticated).toBe(true)
      expect(store.isCitizen).toBe(true)
      expect(store.isAgent).toBe(false)
      expect(store.userType).toBe('citizen')
      expect(store.citizenPayload?.entityGuid).toBe('entity-123')
      expect(store.citizenPayload?.tenantId).toBe('tenant-1')
    })

    it('stores citizen token in sessionStorage', () => {
      const mockToken = createMockJwt({
        scope: 'self-service',
        identifier: 'entity-123',
        entityGuid: 'entity-123',
        tenantId: 'tenant-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const store = useAuthStore()
      store.loginAsCitizen(mockToken)

      expect(sessionStorage.getItem('web_citizen_token')).toBe(mockToken)
      expect(sessionStorage.getItem('web_user_type')).toBe('citizen')
      // Agent localStorage should NOT be set
      expect(localStorage.getItem('web_token')).toBeNull()
    })
  })

  describe('logout', () => {
    it('clears all auth state', async () => {
      const { loginAgent } = await import('@/api/auth')
      const mockToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.mocked(loginAgent).mockResolvedValueOnce({ token: mockToken })

      const store = useAuthStore()
      await store.loginAsAgent({ email: 'agent@test.com', password: 'pass' })
      expect(store.isAuthenticated).toBe(true)

      store.logout()

      expect(store.isAuthenticated).toBe(false)
      expect(store.userType).toBeNull()
      expect(store.token).toBeNull()
      expect(store.agentPayload).toBeNull()
      expect(store.citizenPayload).toBeNull()
      expect(localStorage.getItem('web_token')).toBeNull()
      expect(sessionStorage.getItem('web_citizen_token')).toBeNull()
    })
  })

  describe('initializeAuth', () => {
    it('restores agent session from localStorage', () => {
      const mockToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        role: 'USER',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      localStorage.setItem('web_token', mockToken)
      localStorage.setItem('web_user_type', 'agent')

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.isAuthenticated).toBe(true)
      expect(store.isAgent).toBe(true)
      expect(store.agentPayload?.email).toBe('agent@test.com')
    })

    it('restores citizen session from sessionStorage', () => {
      const mockToken = createMockJwt({
        scope: 'self-service',
        identifier: 'entity-456',
        entityGuid: 'entity-456',
        tenantId: 'tenant-2',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      sessionStorage.setItem('web_citizen_token', mockToken)
      sessionStorage.setItem('web_user_type', 'citizen')

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.isAuthenticated).toBe(true)
      expect(store.isCitizen).toBe(true)
      expect(store.citizenPayload?.tenantId).toBe('tenant-2')
    })

    it('logs out when agent token is expired', () => {
      const mockToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        exp: Math.floor(Date.now() / 1000) - 100, // expired
      })

      localStorage.setItem('web_token', mockToken)
      localStorage.setItem('web_user_type', 'agent')

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('web_token')).toBeNull()
    })

    it('logs out when citizen token is expired', () => {
      const mockToken = createMockJwt({
        scope: 'self-service',
        identifier: 'entity-456',
        entityGuid: 'entity-456',
        tenantId: 'tenant-2',
        exp: Math.floor(Date.now() / 1000) - 100, // expired
      })

      sessionStorage.setItem('web_citizen_token', mockToken)
      sessionStorage.setItem('web_user_type', 'citizen')

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.isAuthenticated).toBe(false)
      expect(sessionStorage.getItem('web_citizen_token')).toBeNull()
    })
  })

  describe('dual-mode exclusivity', () => {
    it('switching from agent to citizen clears agent state', async () => {
      const { loginAgent } = await import('@/api/auth')
      const agentToken = createMockJwt({
        id: '1',
        email: 'agent@test.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.mocked(loginAgent).mockResolvedValueOnce({ token: agentToken })

      const store = useAuthStore()
      await store.loginAsAgent({ email: 'agent@test.com', password: 'pass' })
      expect(store.isAgent).toBe(true)

      const citizenToken = createMockJwt({
        scope: 'self-service',
        identifier: 'entity-789',
        entityGuid: 'entity-789',
        tenantId: 'tenant-3',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      store.loginAsCitizen(citizenToken)

      expect(store.isCitizen).toBe(true)
      expect(store.isAgent).toBe(false)
      expect(store.agentPayload).toBeNull()
      expect(store.citizenPayload?.entityGuid).toBe('entity-789')
    })
  })
})
