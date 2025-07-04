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

/**
 * Check if the device is currently online
 * @returns Promise<boolean> - true if online, false if offline
 */
export async function isOnline(): Promise<boolean> {
  return navigator.onLine
}

/**
 * Listen for network status changes
 * @param callback - Function to call when network status changes
 * @returns Cleanup function to remove the listener
 */
export function onNetworkChange(callback: (isOnline: boolean) => void): () => void {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

/**
 * Check if an error is a 401 Unauthorized error
 * @param error - The error to check
 * @returns boolean - true if it's a 401 error
 */
export function is401Error(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  
  const err = error as Record<string, unknown>
  const response = err.response as Record<string, unknown> | undefined
  
  return (
    response?.status === 401 ||
    err.status === 401 ||
    (typeof err.message === 'string' && (
      err.message.includes('401') ||
      err.message.includes('Unauthorized') ||
      err.message.includes('Invalid token') ||
      err.message.includes('Token expired')
    ))
  )
}

/**
 * Check if an error is a network-related error
 * @param error - The error to check
 * @returns boolean - true if it's a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  
  const err = error as Record<string, unknown>
  
  return (
    err.code === 'NETWORK_ERROR' ||
    (typeof err.message === 'string' && (
      err.message.includes('Network Error') ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('ERR_NETWORK') ||
      err.message.includes('ERR_INTERNET_DISCONNECTED')
    )) ||
    !navigator.onLine
  )
} 