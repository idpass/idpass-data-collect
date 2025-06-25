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

import { AuthConfig } from 'idpass-data-collect'

/**
 * Transform auth configs based on platform
 * @param authConfigs - Raw auth configurations from tenant
 * @param platform - Current platform ('mobile' | 'web')
 * @returns Transformed auth configs with correct redirect URI
 */
export function transformAuthConfigs(
  authConfigs: AuthConfig[],
  platform: 'mobile' | 'web'
): AuthConfig[] {
  return authConfigs
    .filter((config: AuthConfig) => config.fields)
    .map((config: AuthConfig) => {
      const fields = { ...config.fields }

      // Standard OAuth/OIDC fields that should not be in extraQueryParams
      const standardFields = new Set([
        'clientId',
        'client_id',
        'domain',
        'issuer',
        'authority',
        'redirect_uri',
        'redirect_uri_web',
        'redirect_uri_app',
        'scope',
        'scopes',
        'audience',
        'responseType',
        'response_type',
        'clientSecret',
        'client_secret'
      ])

      // Use platform-specific redirect URI
      if (platform === 'mobile') {
        if (fields.redirect_uri_app) {
          fields.redirect_uri = fields.redirect_uri_app
        }
      } else {
        if (fields.redirect_uri_web) {
          fields.redirect_uri = fields.redirect_uri_web
        }
      }

      // Clean up unused redirect URI fields
      delete fields.redirect_uri_app
      delete fields.redirect_uri_web

      // Collect all non-standard fields as extra query params
      const extraQueryParams: Record<string, string> = {}
      Object.keys(fields).forEach((key) => {
        if (!standardFields.has(key)) {
          extraQueryParams[key] = fields[key]
          delete fields[key] // Remove from main fields to avoid duplication
        }
      })

      // Add extraQueryParams to fields if there are any
      if (Object.keys(extraQueryParams).length > 0) {
        fields.extraQueryParams = JSON.stringify(extraQueryParams)
      }

      return {
        type: config.type as 'auth0' | 'keycloak',
        fields
      }
    })
}
