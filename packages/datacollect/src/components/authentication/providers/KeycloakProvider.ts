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

import { OIDCConfig, AuthProvider, AuthProviderConfig } from '../../../interfaces/types'
import OIDCAuthManager from '../../OIDCAuthManager'


export class KeycloakProvider implements AuthProvider {
  name = 'Keycloak'
  description =
    'Keycloak is an open-source Identity and Access Management solution for modern applications and services.'

  createConfig(config: AuthProviderConfig): OIDCConfig {
    const customParams = config.custom && typeof config.custom === 'object' && !Array.isArray(config.custom) 
      ? config.custom as Record<string, string>
      : {};
    return {
      authority: `https://${config.domain as string}`,
      client_id: config.clientId as string,
      redirect_uri: config.redirectUri as string,
      post_logout_redirect_uri: config.postLogoutRedirectUri as string,
      response_type: 'code',
      scope: config.scope as string,
      customParams
    }
  }

  initialize(
    config: AuthProviderConfig,
    authServices: Record<string, OIDCAuthManager>
  ): OIDCAuthManager | null {
    if (!config.enabled) return null

    const service = new OIDCAuthManager(this.createConfig(config))
    authServices[this.name.toLowerCase()] = service
    return service
  }
}
