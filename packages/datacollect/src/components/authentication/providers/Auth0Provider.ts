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

/**
 * Auth0 authentication provider implementation.
 * 
 * Provides Auth0-specific OIDC configuration and authentication manager initialization.
 * Handles Auth0's domain-based authority URLs and custom parameters.
 * 
 * @example
 * ```typescript
 * const auth0Config: AuthProviderConfig = {
 *   enabled: true,
 *   domain: "myapp.auth0.com",
 *   clientId: "my-auth0-client-id",
 *   redirectUri: "https://myapp.com/callback",
 *   postLogoutRedirectUri: "https://myapp.com/logout",
 *   scope: "openid profile email",
 *   custom: { organization: "myapp" }
 * };
 * 
 * const provider = new Auth0Provider();
 * const authManager = provider.initialize(auth0Config, {});
 * ```
 */
export class Auth0Provider implements AuthProvider {
  /** Provider name identifier */
  name = 'Auth0'
  /** Human-readable provider description */
  description =
    'Auth0 is a flexible, drop-in solution to add authentication and authorization services to your applications.'

  /**
   * Create OIDC configuration from Auth0-specific configuration.
   * 
   * Transforms Auth0 configuration format into standard OIDC configuration,
   * including domain-based authority URL construction.
   * 
   * @param config - Auth0-specific configuration settings
   * @returns Standard OIDC configuration for Auth0
   */
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

  /**
   * Initialize Auth0 authentication manager.
   * 
   * Creates and configures an OIDCAuthManager instance for Auth0,
   * registers it in the auth services registry, and returns it.
   * 
   * @param config - Auth0 provider configuration
   * @param authServices - Registry of authentication service instances
   * @returns Initialized OIDCAuthManager or null if disabled
   */
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
