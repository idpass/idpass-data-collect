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

import { AuthProvider, AuthProviderConfig } from '../AuthProvider'
import { OIDCConfig, OIDCAuthService } from '../index'
import { getRedirectUri } from '../authUtils'

export class Auth0Provider implements AuthProvider {
  name = 'Auth0'
  description =
    'Auth0 is a flexible, drop-in solution to add authentication and authorization services to your applications.'

  createConfig(config: AuthProviderConfig): OIDCConfig {
    return {
      authority: `https://${config.domain}`,
      client_id: config.clientId,
      redirect_uri: getRedirectUri(config.webAppURL, config.appCallbackURL),
      post_logout_redirect_uri: getRedirectUri(config.webAppLogoutURL, config.appLogoutURL),
      response_type: 'code',
      scope: config.scope,
      custom: {
        ...config?.custom // Allow custom parameters to be passed
      }
    }
  }

  initialize(
    config: AuthProviderConfig,
    authServices: Record<string, OIDCAuthService>
  ): OIDCAuthService | null {
    if (!config.enabled) return null

    const service = new OIDCAuthService(this.createConfig(config))
    authServices[this.name.toLowerCase()] = service
    return service
  }
}
