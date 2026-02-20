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

import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

let userManagerInstance: UserManager | null = null

export interface OidcTenantConfig {
  authority: string
  clientId: string
  redirectUri: string
  scope: string
  acrValues?: string
}

export function createUserManager(config: OidcTenantConfig): UserManager {
  const settings: UserManagerSettings = {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    response_type: 'code',
    userStore: new WebStorageStateStore({ store: sessionStorage }),
    stateStore: new WebStorageStateStore({ store: sessionStorage }),
    // eSignet-specific: pass acr_values for level of assurance
    extraQueryParams: config.acrValues ? { acr_values: config.acrValues } : undefined,
  }

  userManagerInstance = new UserManager(settings)
  return userManagerInstance
}

export function getUserManager(): UserManager | null {
  return userManagerInstance
}

export async function startOidcLogin(config: OidcTenantConfig, tenantId: string): Promise<void> {
  const manager = createUserManager(config)
  // Store tenantId in state so we can recover it after redirect
  await manager.signinRedirect({ state: { tenantId } })
}

export async function handleOidcCallback(): Promise<{
  idToken: string
  accessToken: string
  tenantId: string
} | null> {
  // Create a temporary manager to process the callback
  // We need to read from the state store which has the original settings
  const manager = userManagerInstance || new UserManager({
    authority: 'https://placeholder',
    client_id: 'placeholder',
    redirect_uri: window.location.origin + '/callback',
    response_type: 'code',
    userStore: new WebStorageStateStore({ store: sessionStorage }),
    stateStore: new WebStorageStateStore({ store: sessionStorage }),
  })

  try {
    const user = await manager.signinRedirectCallback()
    if (!user) return null

    const tenantId = (user.state as { tenantId?: string })?.tenantId || ''

    return {
      idToken: user.id_token || '',
      accessToken: user.access_token || '',
      tenantId,
    }
  } catch (error) {
    console.error('OIDC callback failed:', error)
    return null
  }
}

export function clearOidcState(): void {
  if (userManagerInstance) {
    userManagerInstance.removeUser()
    userManagerInstance = null
  }
}
