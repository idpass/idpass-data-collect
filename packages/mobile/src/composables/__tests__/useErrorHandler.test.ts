/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useErrorHandler } from '../useErrorHandler'
import { useRouter } from 'vue-router'
import { useAuthManagerStore } from '@/store/authManager'
import { is401Error, isNetworkError } from '@/utils/networkUtils'
import type { Router } from 'vue-router'

// Mock dependencies
vi.mock('vue-router')
vi.mock('@/store/authManager')
vi.mock('@/utils/networkUtils')

describe('useErrorHandler', () => {
  let mockRouter: Record<string, ReturnType<typeof vi.fn>>
  let mockAuthManagerStore: Record<string, ReturnType<typeof vi.fn>>
  let errorHandler: ReturnType<typeof useErrorHandler>

  beforeEach(() => {
    // Setup router mock
    mockRouter = {
      push: vi.fn(),
    }
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as Router)

    // Setup auth manager store mock
    mockAuthManagerStore = {
      initialize: vi.fn(),
      logout: vi.fn(),
    }
    vi.mocked(useAuthManagerStore).mockReturnValue(mockAuthManagerStore as unknown as ReturnType<typeof useAuthManagerStore>)

    // Setup network utils mocks
    vi.mocked(is401Error).mockReturnValue(false)
    vi.mocked(isNetworkError).mockReturnValue(false)

    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    errorHandler = useErrorHandler()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('handleAuthError', () => {
    it('should handle auth error with app ID', async () => {
      const appId = 'test-app-id'
      
      await errorHandler.handleAuthError(appId)

      expect(mockAuthManagerStore.initialize).toHaveBeenCalledWith(appId)
      expect(mockAuthManagerStore.logout).toHaveBeenCalledWith(appId)
      expect(mockRouter.push).toHaveBeenCalledWith({ name: 'app-login', params: { id: appId } })
    })

    it('should redirect to home when no app ID provided', async () => {
      await errorHandler.handleAuthError()

      expect(mockRouter.push).toHaveBeenCalledWith({ name: 'home' })
      expect(mockAuthManagerStore.initialize).not.toHaveBeenCalled()
    })

    it('should handle logout failure gracefully', async () => {
      const appId = 'test-app-id'
      mockAuthManagerStore.logout.mockRejectedValue(new Error('Logout failed'))

      await errorHandler.handleAuthError(appId)

      expect(console.error).toHaveBeenCalledWith('Logout failed:', expect.any(Error))
      expect(mockRouter.push).toHaveBeenCalledWith({ name: 'app-login', params: { id: appId } })
    })
  })

  describe('getProviderErrorMessage', () => {
    it('should return generic message for non-object errors', () => {
      const message = errorHandler.getProviderErrorMessage(null, 'Auth0')
      expect(message).toBe('Failed to connect to Auth0. Please try again or contact support.')
    })

    it('should handle fetch errors', () => {
      const error = { message: 'Failed to fetch' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Unable to connect to Auth0. Please check your provider and try again.')
    })

    it('should handle network errors', () => {
      const error = { message: 'Network connection failed' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Unable to connect to Auth0. Please check your internet connection and try again.')
    })

    it('should handle popup blocked errors', () => {
      const error = { message: 'popup blocked' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Pop-up blocked. Please allow pop-ups for this site to sign in with Auth0.')
    })

    it('should handle cancelled authentication', () => {
      const error = { message: 'Authentication cancelled' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Sign-in with Auth0 was cancelled.')
    })

    it('should handle timeout errors', () => {
      const error = { message: 'timeout occurred' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Connection to Auth0 timed out. Please try again.')
    })

    it('should handle unauthorized errors', () => {
      const error = { message: 'Unauthorized access' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Access denied by Auth0. Please check your account permissions.')
    })

    it('should handle client configuration errors', () => {
      const error = { message: 'invalid_client' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Auth0 configuration error. Please contact support.')
    })

    it('should handle server errors', () => {
      const error = { message: 'server_error' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Auth0 server error. Please try again later.')
    })

    it('should handle OIDC errors', () => {
      const error = { message: 'OIDC authentication failed' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Auth0 authentication service is unavailable. Please try again later.')
    })

    it('should handle CORS errors', () => {
      const error = { message: 'CORS policy error' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Auth0 configuration error. Please contact support.')
    })

    it('should handle connection errors that match network pattern first', () => {
      const error = { message: 'Connection timeout' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Unable to connect to Auth0. Please check your internet connection and try again.')
    })

    it('should handle blocked popup errors that match popup pattern first', () => {
      const error = { message: 'CORS policy blocked' }
      const message = errorHandler.getProviderErrorMessage(error, 'Auth0')
      expect(message).toBe('Pop-up blocked. Please allow pop-ups for this site to sign in with Auth0.')
    })
  })

  describe('getCallbackErrorMessage', () => {
    it('should return generic message for non-object errors', () => {
      const message = errorHandler.getCallbackErrorMessage(null)
      expect(message).toBe('Authentication callback failed. Please try again.')
    })

    it('should handle app ID not found errors', () => {
      const error = { message: 'App ID not found in callback URL' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authentication session expired. Please try signing in again.')
    })

    it('should handle tenant configuration errors', () => {
      const error = { message: 'No tenant configuration found' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Application configuration error. Please contact support.')
    })

    it('should handle callback redirect errors', () => {
      const error = { message: 'Callback redirect failed' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authentication redirect failed. Please try again or contact support.')
    })

    it('should handle token errors', () => {
      const error = { message: 'Invalid token received' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authentication token invalid. Please try signing in again.')
    })

    it('should handle network errors during callback', () => {
      const error = { message: 'Network connection lost' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Network connection lost during authentication. Please check your connection and try again.')
    })

    it('should handle state/CSRF errors', () => {
      const error = { message: 'State parameter mismatch' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authentication security check failed. Please try signing in again.')
    })

    it('should handle authorization code errors with specific pattern', () => {
      const error = { message: 'authorization code is invalid' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authorization code invalid. Please try signing in again.')
    })

    it('should handle general code errors that now match code pattern first', () => {
      const error = { message: 'Invalid authorization code' }
      const message = errorHandler.getCallbackErrorMessage(error)
      expect(message).toBe('Authorization code invalid. Please try signing in again.')
    })
  })

  describe('getErrorMessage', () => {
    it('should extract message from axios response error', () => {
      const error = {
        response: {
          data: {
            message: 'Server validation failed'
          }
        }
      }
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Server validation failed')
    })

    it('should extract message from axios response data string', () => {
      const error = {
        response: {
          data: 'Invalid request format'
        }
      }
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Invalid request format')
    })

    it('should extract error from response data', () => {
      const error = {
        response: {
          data: {
            error: 'Database connection failed'
          }
        }
      }
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Database connection failed')
    })

    it('should use status text as fallback', () => {
      const error = {
        response: {
          statusText: 'Internal Server Error'
        }
      }
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Internal Server Error')
    })

    it('should use direct error message', () => {
      const error = { message: 'Direct error message' }
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Direct error message')
    })

    it('should handle 401 errors', () => {
      const error = { message: 'Unauthorized' }
      vi.mocked(is401Error).mockReturnValue(true)
      
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Unauthorized')
    })

    it('should handle network errors', () => {
      const error = { message: 'Network failed' }
      vi.mocked(isNetworkError).mockReturnValue(true)
      
      const message = errorHandler.getErrorMessage(error)
      expect(message).toBe('Network failed')
    })

    it('should return generic message for unknown errors', () => {
      const message = errorHandler.getErrorMessage({})
      expect(message).toBe('An unexpected error occurred. Please try again.')
    })
  })

  describe('handleError', () => {
    it('should handle 401 errors', async () => {
      const error = { message: 'Unauthorized' }
      vi.mocked(is401Error).mockReturnValue(true)
      
      const result = await errorHandler.handleError(error, 'test-app-id')
      
      expect(result.handled).toBe(true)
      expect(result.message).toBe('Unauthorized')
      expect(console.warn).toHaveBeenCalledWith('Authentication error detected, logging out')
    })

    it('should handle network errors', async () => {
      const error = { message: 'Network failed' }
      vi.mocked(isNetworkError).mockReturnValue(true)
      
      const result = await errorHandler.handleError(error)
      
      expect(result.handled).toBe(true)
      expect(result.message).toBe('Network failed')
      expect(console.warn).toHaveBeenCalledWith('Network error detected')
    })

    it('should not handle other errors', async () => {
      const error = { message: 'Some other error' }
      
      const result = await errorHandler.handleError(error)
      
      expect(result.handled).toBe(false)
      expect(result.message).toBe('Some other error')
    })
  })

  describe('wrapWithErrorHandling', () => {
    it('should execute function successfully', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      const wrappedFn = errorHandler.wrapWithErrorHandling(mockFn)
      
      const result = await wrappedFn('arg1', 'arg2')
      
      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('should handle handled errors', async () => {
      const mockFn = vi.fn().mockRejectedValue({ message: 'Unauthorized' })
      vi.mocked(is401Error).mockReturnValue(true)
      const wrappedFn = errorHandler.wrapWithErrorHandling(mockFn, 'test-app-id')
      
      const result = await wrappedFn('arg1')
      
      expect(result).toBeNull()
      expect(mockFn).toHaveBeenCalledWith('arg1')
    })

    it('should re-throw unhandled errors', async () => {
      const error = { message: 'Some other error' }
      const mockFn = vi.fn().mockRejectedValue(error)
      const wrappedFn = errorHandler.wrapWithErrorHandling(mockFn)
      
      await expect(wrappedFn()).rejects.toThrow()
    })
  })

  describe('useErrorHandler with appId parameter', () => {
    it('should use provided appId in handleAuthError', async () => {
      const errorHandlerWithAppId = useErrorHandler('default-app-id')
      
      await errorHandlerWithAppId.handleAuthError()
      
      expect(mockAuthManagerStore.initialize).toHaveBeenCalledWith('default-app-id')
      expect(mockAuthManagerStore.logout).toHaveBeenCalledWith('default-app-id')
    })

    it('should prioritize currentAppId over default appId', async () => {
      const errorHandlerWithAppId = useErrorHandler('default-app-id')
      
      await errorHandlerWithAppId.handleAuthError('current-app-id')
      
      expect(mockAuthManagerStore.initialize).toHaveBeenCalledWith('current-app-id')
      expect(mockAuthManagerStore.logout).toHaveBeenCalledWith('current-app-id')
    })
  })
}) 