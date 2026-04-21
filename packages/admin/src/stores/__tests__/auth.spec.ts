import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'
import { useAuthStore } from '../auth'

vi.mock('axios', () => {
  const instance = {
    post: vi.fn(),
    get: vi.fn(),
    defaults: {
      headers: {
        common: {} as Record<string, string>,
      },
    },
  }
  return { default: instance }
})

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))

// Helper to create a JWT-like token with a given payload
function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = 'fake-signature'
  return `${header}.${body}.${signature}`
}

describe('auth store', () => {
  let mockRouter: { push: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
    // Re-import the mocked router to get the mock reference
    const routerModule = await import('@/router')
    mockRouter = routerModule.default as unknown as { push: ReturnType<typeof vi.fn> }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('login', () => {
    it('sets token and decoded payload on successful login', async () => {
      const token = createToken({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'ADMIN',
        tenantIds: ['tenant-1', 'tenant-2'],
      })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      const result = await store.login({ email: 'admin@example.com', password: 'secret' })

      expect(result).toBe(true)
      expect(store.token).toBe(token)
      expect(store.isAuthenticated).toBe(true)
      expect(localStorage.getItem('token')).toBe(token)
      expect(mockRouter.push).toHaveBeenCalledWith('/')
    })

    it('returns false on failed login', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Unauthorized'))

      const store = useAuthStore()
      const result = await store.login({ email: 'bad@example.com', password: 'wrong' })

      expect(result).toBe(false)
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears token, localStorage, and navigates to login', async () => {
      const token = createToken({ id: 'user-1', email: 'a@b.com', role: 'ADMIN' })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      await store.login({ email: 'a@b.com', password: 'pass' })

      store.logout()

      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('token')).toBeNull()
      expect(mockRouter.push).toHaveBeenCalledWith('/login')
    })
  })

  describe('isAdmin', () => {
    it('returns true when decoded JWT has role ADMIN', async () => {
      const token = createToken({ id: 'user-1', email: 'a@b.com', role: 'ADMIN' })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      await store.login({ email: 'a@b.com', password: 'pass' })

      expect(store.isAdmin).toBe(true)
    })

    it('returns false when decoded JWT has non-ADMIN role', async () => {
      const token = createToken({ id: 'user-1', email: 'a@b.com', role: 'USER' })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      await store.login({ email: 'a@b.com', password: 'pass' })

      expect(store.isAdmin).toBe(false)
    })

    it('returns false when no token is set', () => {
      const store = useAuthStore()
      expect(store.isAdmin).toBe(false)
    })
  })

  describe('userTenantIds', () => {
    it('returns tenantIds from decoded JWT', async () => {
      const token = createToken({
        id: 'user-1',
        email: 'a@b.com',
        tenantIds: ['t1', 't2', 't3'],
      })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      await store.login({ email: 'a@b.com', password: 'pass' })

      expect(store.userTenantIds).toEqual(['t1', 't2', 't3'])
    })

    it('returns empty array when JWT has no tenantIds', async () => {
      const token = createToken({ id: 'user-1', email: 'a@b.com' })
      vi.mocked(axios.post).mockResolvedValue({ data: { token } })

      const store = useAuthStore()
      await store.login({ email: 'a@b.com', password: 'pass' })

      expect(store.userTenantIds).toEqual([])
    })

    it('returns empty array when no token is set', () => {
      const store = useAuthStore()
      expect(store.userTenantIds).toEqual([])
    })
  })

  describe('initializeAuth', () => {
    it('restores token from localStorage and starts refresh timer', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createToken({
        id: 'user-1',
        email: 'a@b.com',
        role: 'ADMIN',
        tenantIds: ['t1'],
        exp: futureExp,
      })
      localStorage.setItem('token', token)

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.token).toBe(token)
      expect(store.isAuthenticated).toBe(true)
      expect(store.isAdmin).toBe(true)
      expect(store.userTenantIds).toEqual(['t1'])
    })

    it('calls logout when stored token is expired', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 100
      const token = createToken({
        id: 'user-1',
        email: 'a@b.com',
        exp: pastExp,
      })
      localStorage.setItem('token', token)

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('token')).toBeNull()
      expect(mockRouter.push).toHaveBeenCalledWith('/login')
    })

    it('does nothing when no token exists in localStorage', () => {
      const store = useAuthStore()
      store.initializeAuth()

      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('keeps token when it has no exp claim', () => {
      const token = createToken({
        id: 'user-1',
        email: 'a@b.com',
        role: 'USER',
      })
      localStorage.setItem('token', token)

      const store = useAuthStore()
      store.initializeAuth()

      expect(store.token).toBe(token)
      expect(store.isAuthenticated).toBe(true)
    })
  })
})
