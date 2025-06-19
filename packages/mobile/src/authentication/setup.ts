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

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { OIDCAuthService } from './index'
import { ProviderRegistry } from './AuthProvider'
import { Auth0Provider } from './providers/Auth0Provider'
import { KeycloakProvider } from './providers/KeycloakProvider'
import { AUTH_FIELD_KEYS } from './authUtils'

// Register available providers
ProviderRegistry.register('auth0', new Auth0Provider())
ProviderRegistry.register('keycloak', new KeycloakProvider())

interface AuthHandlers {
  onAuthSuccess: () => void
  onAuthError: (error: any) => void
}

export const setupAuthHandling = (service: OIDCAuthService, handlers: AuthHandlers) => {
  // Handle mobile platform URL callbacks
  if (Capacitor.getPlatform() !== 'web') {
    App.addListener('appUrlOpen', async ({ url }) => {
      try {
        const urlObj = new URL(url)
        if (urlObj.pathname.includes('callback')) {
          const code = urlObj.searchParams.get('code')
          if (code) {
            handlers.onAuthSuccess()
          }
        }
      } catch (error) {
        console.error('Error handling app URL:', error)
        handlers.onAuthError(error)
      }
    })
  }

  // Set up the callback handler
  const originalHandler = service.handleCallback
  service.handleCallback = async () => {
    try {
      const result = await originalHandler.call(service)
      handlers.onAuthSuccess()
      return result
    } catch (error) {
      handlers.onAuthError(error)
      throw error
    }
  }
}

const determineRedirectUrl = (appId: string): string => {
  const redirect = localStorage.getItem(AUTH_FIELD_KEYS.auth_redirect_url) || `/app/${appId}`
  return redirect
}

const cleanupAuthStorage = () => {
  localStorage.removeItem(AUTH_FIELD_KEYS.auth_redirect_url)
}

const storeAuthResult = (appId: string, providerName: string) => {
  localStorage.setItem(`${AUTH_FIELD_KEYS.last_auth_provider}_${appId}`, providerName)
}

export const initializeProviders = (
  authConfig: any,
  loadingStates: any,
  currentAppId: any,
  authServices: Record<string, OIDCAuthService>
) => {
  const providers = ProviderRegistry.getAll()

  providers.forEach((provider) => {
    const providerConfig = authConfig[provider.name.toLowerCase()]
    if (providerConfig) {
      const service = provider.initialize(providerConfig, authServices)
      if (service) {
        setupAuthHandling(service, {
          onAuthSuccess: () => {
            const providerName = provider.name.toLowerCase()
            loadingStates.value[providerName] = false

            if (!currentAppId) {
              console.error('No app ID available for storing auth result')
              return
            }

            storeAuthResult(currentAppId, providerName)
            const redirectUrl = determineRedirectUrl(currentAppId)
            cleanupAuthStorage()
            window.location.href = redirectUrl
          },
          onAuthError: (error) => {
            loadingStates.value[provider.name.toLowerCase()] = false
            console.error(`${provider.name} login failed:`, error)

            // Get the app ID for error redirect
          }
        })
      }
    }
  })
}
