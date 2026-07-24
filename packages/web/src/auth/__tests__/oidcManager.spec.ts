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

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock oidc-client-ts before importing the module under test
const mockSigninRedirect = vi.fn()
const mockSigninRedirectCallback = vi.fn()
const mockRemoveUser = vi.fn()

vi.mock('oidc-client-ts', () => ({
  UserManager: vi.fn().mockImplementation(function () {
    return {
      signinRedirect: mockSigninRedirect,
      signinRedirectCallback: mockSigninRedirectCallback,
      removeUser: mockRemoveUser,
    }
  }),
  WebStorageStateStore: vi.fn().mockImplementation(function () {
    return {}
  }),
}))

import {
  createUserManager,
  startOidcLogin,
  handleOidcCallback,
  clearOidcState,
  type OidcTenantConfig,
} from '@/auth/oidcManager'
import { UserManager } from 'oidc-client-ts'

const testConfig: OidcTenantConfig = {
  authority: 'https://esignet.example.org',
  clientId: 'test-client-id',
  redirectUri: 'http://localhost:5174/callback',
  scope: 'openid profile',
  acrValues: 'mosip:idp:acr:biometrics',
}

describe('oidcManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Reset the module-level userManagerInstance by clearing OIDC state
    clearOidcState()
  })

  describe('createUserManager', () => {
    it('creates a UserManager with correct settings', () => {
      const manager = createUserManager(testConfig)

      expect(UserManager).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: 'https://esignet.example.org',
          client_id: 'test-client-id',
          redirect_uri: 'http://localhost:5174/callback',
          scope: 'openid profile',
          response_type: 'code',
          extraQueryParams: { acr_values: 'mosip:idp:acr:biometrics' },
        }),
      )

      expect(manager).toBeDefined()
    })

    it('does not pass extraQueryParams when acrValues is absent', () => {
      const configWithoutAcr = { ...testConfig, acrValues: undefined }
      createUserManager(configWithoutAcr)

      expect(UserManager).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: undefined,
        }),
      )
    })
  })

  describe('startOidcLogin', () => {
    it('persists config in sessionStorage and calls signinRedirect', async () => {
      mockSigninRedirect.mockResolvedValueOnce(undefined)

      await startOidcLogin(testConfig, 'tenant-abc')

      // Config should be saved for the callback to use
      const savedConfig = sessionStorage.getItem('web_oidc_config')
      expect(savedConfig).not.toBeNull()
      expect(JSON.parse(savedConfig!)).toEqual(testConfig)

      // signinRedirect should be called with tenantId in state
      expect(mockSigninRedirect).toHaveBeenCalledWith({
        state: { tenantId: 'tenant-abc' },
      })
    })
  })

  describe('handleOidcCallback', () => {
    it('processes callback with in-memory UserManager', async () => {
      // First create a manager via startOidcLogin
      mockSigninRedirect.mockResolvedValueOnce(undefined)
      await startOidcLogin(testConfig, 'tenant-abc')

      mockSigninRedirectCallback.mockResolvedValueOnce({
        id_token: 'mock-id-token',
        access_token: 'mock-access-token',
        state: { tenantId: 'tenant-abc' },
      })

      const result = await handleOidcCallback()

      expect(result).toEqual({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        tenantId: 'tenant-abc',
      })
    })

    it('reconstructs UserManager from sessionStorage when in-memory instance is gone', async () => {
      // Simulate: config was saved but page was refreshed (in-memory instance is gone)
      clearOidcState()
      sessionStorage.setItem('web_oidc_config', JSON.stringify(testConfig))

      mockSigninRedirectCallback.mockResolvedValueOnce({
        id_token: 'restored-id-token',
        access_token: 'restored-access-token',
        state: { tenantId: 'tenant-xyz' },
      })

      const result = await handleOidcCallback()

      expect(result).toEqual({
        idToken: 'restored-id-token',
        accessToken: 'restored-access-token',
        tenantId: 'tenant-xyz',
      })

      // Config should be cleaned up after successful callback
      expect(sessionStorage.getItem('web_oidc_config')).toBeNull()
    })

    it('returns null when no config is available and no in-memory manager', async () => {
      clearOidcState()
      // No sessionStorage config, no in-memory manager

      const result = await handleOidcCallback()

      expect(result).toBeNull()
    })

    it('returns null when signinRedirectCallback returns null', async () => {
      mockSigninRedirect.mockResolvedValueOnce(undefined)
      await startOidcLogin(testConfig, 'tenant-abc')

      mockSigninRedirectCallback.mockResolvedValueOnce(null)

      const result = await handleOidcCallback()

      expect(result).toBeNull()
    })

    it('returns null when signinRedirectCallback throws', async () => {
      mockSigninRedirect.mockResolvedValueOnce(undefined)
      await startOidcLogin(testConfig, 'tenant-abc')

      mockSigninRedirectCallback.mockRejectedValueOnce(new Error('State mismatch'))

      const result = await handleOidcCallback()

      expect(result).toBeNull()
    })

    it('returns empty tenantId when state is missing', async () => {
      mockSigninRedirect.mockResolvedValueOnce(undefined)
      await startOidcLogin(testConfig, 'tenant-abc')

      mockSigninRedirectCallback.mockResolvedValueOnce({
        id_token: 'some-token',
        access_token: 'some-access',
        state: {},
      })

      const result = await handleOidcCallback()

      expect(result?.tenantId).toBe('')
    })
  })

  describe('clearOidcState', () => {
    it('calls removeUser on the manager', async () => {
      mockSigninRedirect.mockResolvedValueOnce(undefined)
      await startOidcLogin(testConfig, 'tenant-abc')

      clearOidcState()

      expect(mockRemoveUser).toHaveBeenCalled()
    })
  })
})
