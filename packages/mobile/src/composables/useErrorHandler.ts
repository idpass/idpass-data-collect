/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useRouter } from 'vue-router'
import { useAuthManagerStore } from '@/store/authManager'
import { is401Error, isNetworkError } from '@/utils/networkUtils'

export function useErrorHandler(appId?: string) {
  const router = useRouter()
  const authManagerStore = useAuthManagerStore()

  const handleAuthError = async (currentAppId?: string) => {
    const targetAppId = currentAppId || appId
    if (!targetAppId) {
      console.error('No app ID provided for auth error handling')
      router.push({ name: 'home' })
      return
    }

    try {
      await authManagerStore.initialize(targetAppId)
      await authManagerStore.logout(targetAppId)
      router.push({ name: 'app-login', params: { id: targetAppId } })
    } catch (error) {
      console.error('Logout failed:', error)
      router.push({ name: 'app-login', params: { id: targetAppId } })
    }
  }

  const getProviderErrorMessage = (error: unknown, providerName: string): string => {
    if (!error || typeof error !== 'object') {
      return `Failed to connect to ${providerName}. Please try again or contact support.`
    }

    const err = error as Record<string, unknown>
    const errorStr = String(err.message || '').toLowerCase()
    const errorName = String(err.name || '').toLowerCase()

    // Check for specific OIDC client errors
    if (errorStr.includes('failed to fetch') || errorName.includes('typeerror')) {
      return `Unable to connect to ${providerName}. Please check your provider and try again.`
    }
    
    // Check for specific OAuth provider errors
    if (errorStr.includes('network') || errorStr.includes('fetch') || errorStr.includes('connection')) {
      return `Unable to connect to ${providerName}. Please check your internet connection and try again.`
    }
    
    if (errorStr.includes('popup') || errorStr.includes('blocked')) {
      return `Pop-up blocked. Please allow pop-ups for this site to sign in with ${providerName}.`
    }
    
    if (errorStr.includes('cancelled') || errorStr.includes('canceled')) {
      return `Sign-in with ${providerName} was cancelled.`
    }
    
    if (errorStr.includes('timeout')) {
      return `Connection to ${providerName} timed out. Please try again.`
    }
    
    if (errorStr.includes('unauthorized') || errorStr.includes('forbidden')) {
      return `Access denied by ${providerName}. Please check your account permissions.`
    }
    
    if (errorStr.includes('invalid_client') || errorStr.includes('client')) {
      return `${providerName} configuration error. Please contact support.`
    }
    
    if (errorStr.includes('invalid_request')) {
      return `Invalid request to ${providerName}. Please try again or contact support.`
    }
    
    if (errorStr.includes('server_error') || errorStr.includes('internal_error')) {
      return `${providerName} server error. Please try again later.`
    }
    
    if (errorStr.includes('temporarily_unavailable')) {
      return `${providerName} is temporarily unavailable. Please try again later.`
    }

    // Check for OIDC-specific errors
    if (errorStr.includes('oidc') || errorStr.includes('openid')) {
      return `${providerName} authentication service is unavailable. Please try again later.`
    }

    // Check for CORS errors
    if (errorStr.includes('cors') || errorStr.includes('cross-origin')) {
      return `${providerName} configuration error. Please contact support.`
    }

    // Check for backend error message first
    const backendMessage = getErrorMessage(error)
    if (backendMessage && backendMessage !== 'An unexpected error occurred. Please try again.') {
      return backendMessage
    }

    return `Failed to connect to ${providerName}. Please try again or contact support.`
  }

  const getCallbackErrorMessage = (error: unknown): string => {
    if (!error || typeof error !== 'object') {
      return 'Authentication callback failed. Please try again.'
    }

    const err = error as Record<string, unknown>
    const errorStr = String(err.message || '').toLowerCase()

    if (errorStr.includes('app id not found')) {
      return 'Authentication session expired. Please try signing in again.'
    }
    
    if (errorStr.includes('tenant configuration')) {
      return 'Application configuration error. Please contact support.'
    }
    
    if (errorStr.includes('callback') || errorStr.includes('redirect')) {
      return 'Authentication redirect failed. Please try again or contact support.'
    }
    
    if (errorStr.includes('token') || errorStr.includes('invalid')) {
      return 'Authentication token invalid. Please try signing in again.'
    }
    
    if (errorStr.includes('network') || errorStr.includes('connection')) {
      return 'Network connection lost during authentication. Please check your connection and try again.'
    }
    
    if (errorStr.includes('state') || errorStr.includes('csrf')) {
      return 'Authentication security check failed. Please try signing in again.'
    }
    
    if (errorStr.includes('code') || errorStr.includes('authorization')) {
      return 'Authorization code invalid. Please try signing in again.'
    }

    // Check for backend error message first
    const backendMessage = getErrorMessage(error)
    if (backendMessage && backendMessage !== 'An unexpected error occurred. Please try again.') {
      return backendMessage
    }

    return 'Authentication failed. Please try again or contact support.'
  }

  const getErrorMessage = (error: unknown): string => {
    // Extract error message from different error formats first
    let backendMessage = ''
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>
      
      // Check for axios response errors (most common)
      if (err.response && typeof err.response === 'object') {
        const response = err.response as Record<string, unknown>
        if (response.data) {
          if (typeof response.data === 'string') {
            backendMessage = response.data
          } else if (typeof response.data === 'object') {
            const data = response.data as Record<string, unknown>
            if (typeof data.message === 'string') {
              backendMessage = data.message
            } else if (typeof data.error === 'string') {
              backendMessage = data.error
            }
          }
        }
        // Check response status text
        if (!backendMessage && typeof response.statusText === 'string') {
          backendMessage = response.statusText
        }
      }
      
      // Check direct error message
      if (!backendMessage && typeof err.message === 'string') {
        backendMessage = err.message
      }
    }

    // Now apply specific handling based on error type
    if (is401Error(error)) {
      return backendMessage || 'Session expired. Please log in again.'
    }
    
    if (isNetworkError(error)) {
      // Only show generic network message if no specific backend message
      return backendMessage || 'Network connection failed. Please check your internet connection.'
    }

    // For other errors, prefer backend message
    return backendMessage || 'An unexpected error occurred. Please try again.'
  }

  const handleError = async (error: unknown, currentAppId?: string): Promise<{ handled: boolean; message: string }> => {
    console.error('Error occurred:', error)
    const errorMessage = getErrorMessage(error)

    if (is401Error(error)) {
      console.warn('Authentication error detected, logging out')
      await handleAuthError(currentAppId)
      return { handled: true, message: errorMessage }
    }

    if (isNetworkError(error)) {
      console.warn('Network error detected')
      return { handled: true, message: errorMessage }
    }

    // For other errors, let them bubble up
    return { handled: false, message: errorMessage }
  }

  const wrapWithErrorHandling = <T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    currentAppId?: string
  ) => {
    return async (...args: T): Promise<R | null> => {
      try {
        return await fn(...args)
      } catch (error) {
        const errorResult = await handleError(error, currentAppId)
        if (!errorResult.handled) {
          throw error
        }
        return null
      }
    }
  }

  return {
    handleAuthError,
    handleError,
    wrapWithErrorHandling,
    getErrorMessage,
    getProviderErrorMessage,
    getCallbackErrorMessage
  }
} 