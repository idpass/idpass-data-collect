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

import { OIDCConfig, OIDCAuthService } from './index'

export interface AuthProviderConfig {
  enabled: boolean
  [key: string]: any
}

export interface AuthProvider {
  name: string
  description: string
  createConfig(config: AuthProviderConfig): OIDCConfig
  initialize(
    config: AuthProviderConfig,
    authServices: Record<string, OIDCAuthService>
  ): OIDCAuthService | null
}

class ProviderRegistry {
  private static providers: Map<string, AuthProvider> = new Map()

  static register(name: string, provider: AuthProvider) {
    this.providers.set(name.toLowerCase(), provider)
  }

  static get(name: string): AuthProvider | undefined {
    return this.providers.get(name.toLowerCase())
  }

  static getAll(): AuthProvider[] {
    return Array.from(this.providers.values())
  }
}

export { ProviderRegistry }
