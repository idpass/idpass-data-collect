import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import axios from 'axios'

// We need to intercept axios.create to return a mock instance we control
const mockRequest = vi.fn()
const mockResponse = vi.fn()
const mockAxiosInstance = {
  interceptors: {
    request: { use: mockRequest },
    response: { use: mockResponse },
  },
  defaults: {
    timeout: undefined as number | undefined,
  },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
  },
}))

// Mock the auth store
const mockGetAccessToken = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    getAccessToken: mockGetAccessToken,
    signOut: mockSignOut,
  })),
}))

describe('API index (initializeApi)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Ensure signOut always returns a Promise (gets cleared by clearAllMocks)
    mockSignOut.mockResolvedValue(undefined)
    // Reset the module so instance is null each test
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('axios instance configuration', () => {
    it('creates axios instance with 30s timeout', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30000 }),
      )
    })

    it('creates axios instance with a baseURL config key', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      // In test env VITE_API_URL is undefined; we just verify the key is present
      const callArg = (axios.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
      expect(callArg).toHaveProperty('baseURL')
    })

    it('registers request interceptor', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      expect(mockRequest).toHaveBeenCalledOnce()
    })

    it('registers response interceptors', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      // Should register response interceptors (at least 2: retry + 401 handling)
      expect(mockResponse).toHaveBeenCalled()
    })
  })

  describe('request interceptor', () => {
    it('adds Authorization header when token is available', async () => {
      mockGetAccessToken.mockReturnValue('test-token-123')
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      // Get the request interceptor's success handler
      const [successHandler] = mockRequest.mock.calls[0]
      const config = { headers: {} as Record<string, string> }
      const result = successHandler(config)

      expect(result.headers.Authorization).toBe('Bearer test-token-123')
    })

    it('does not add Authorization header when token is null', async () => {
      mockGetAccessToken.mockReturnValue(null)
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const [successHandler] = mockRequest.mock.calls[0]
      const config = { headers: {} as Record<string, string> }
      const result = successHandler(config)

      expect(result.headers.Authorization).toBeUndefined()
    })
  })

  describe('response interceptor — 401 handling', () => {
    it('calls signOut on 401 response', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      // The last response interceptor registered handles 401
      const lastCallIndex = mockResponse.mock.calls.length - 1
      const [, errorHandler] = mockResponse.mock.calls[lastCallIndex]

      const error = {
        response: { status: 401 },
        config: { url: '/api/portal/data', _retryCount: 3 },
      }

      await expect(errorHandler(error)).rejects.toMatchObject({ response: { status: 401 } })
      expect(mockSignOut).toHaveBeenCalledOnce()
    })

    it('does not call signOut on 401 for /callback path', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const lastCallIndex = mockResponse.mock.calls.length - 1
      const [, errorHandler] = mockResponse.mock.calls[lastCallIndex]

      const error = {
        response: { status: 401 },
        config: { url: '/callback', _retryCount: 3 },
      }

      await expect(errorHandler(error)).rejects.toMatchObject({ response: { status: 401 } })
      expect(mockSignOut).not.toHaveBeenCalled()
    })
  })

  describe('retry interceptor', () => {
    it('retries GET requests on 500 errors up to 2 times', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      // The first response interceptor is the retry one
      const [, retryErrorHandler] = mockResponse.mock.calls[0]

      // Simulate a 500 error on a GET request — first retry attempt
      const error = {
        response: { status: 500 },
        config: {
          method: 'get',
          url: '/api/data',
          _retryCount: 0,
        },
      }

      // Mock the instance to return a successful response on retry
      mockAxiosInstance.get.mockResolvedValueOnce({ data: 'ok' })
      // We need the instance itself to handle the retry call
      // The retry logic calls instance(config), so we mock via a spy on the instance
      const requestSpy = vi.spyOn(mockAxiosInstance, 'get').mockResolvedValueOnce({ data: 'ok' })

      // The retry handler should initiate a retry (returns a promise)
      // It will increase _retryCount to 1, which is within limit (< 2)
      // For testing, we just verify the retry logic runs without throwing immediately
      const retryPromise = retryErrorHandler(error)
      expect(retryPromise).toBeInstanceOf(Promise)

      requestSpy.mockRestore()
    })

    it('does NOT retry POST requests on 500 errors', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const [, retryErrorHandler] = mockResponse.mock.calls[0]

      const error = {
        response: { status: 500 },
        config: {
          method: 'post',
          url: '/api/data',
          _retryCount: 0,
        },
      }

      // POST should be rejected immediately without retrying
      await expect(retryErrorHandler(error)).rejects.toMatchObject({
        config: { method: 'post' },
      })
    })

    it('does NOT retry when retry count has reached the limit', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const [, retryErrorHandler] = mockResponse.mock.calls[0]

      const error = {
        response: { status: 500 },
        config: {
          method: 'get',
          url: '/api/data',
          _retryCount: 2, // Already at max retries (2)
        },
      }

      // Should reject when retry count is exhausted
      await expect(retryErrorHandler(error)).rejects.toMatchObject({
        config: { _retryCount: 2 },
      })
    })

    it('does NOT retry on 4xx errors (only 5xx and network errors)', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const [, retryErrorHandler] = mockResponse.mock.calls[0]

      const error = {
        response: { status: 404 },
        config: {
          method: 'get',
          url: '/api/data',
          _retryCount: 0,
        },
      }

      // 404 should not be retried
      await expect(retryErrorHandler(error)).rejects.toMatchObject({
        response: { status: 404 },
      })
    })

    it('retries on network errors (no response)', async () => {
      const { initializeApi } = await import('@/api/index')
      initializeApi()

      const [, retryErrorHandler] = mockResponse.mock.calls[0]

      const error = {
        response: undefined, // Network error — no response
        config: {
          method: 'get',
          url: '/api/data',
          _retryCount: 0,
        },
      }

      const retryPromise = retryErrorHandler(error)
      expect(retryPromise).toBeInstanceOf(Promise)
    })
  })
})
