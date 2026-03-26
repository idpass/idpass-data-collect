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
 * OpenSPP V2 API Client for Admin Package
 *
 * Lightweight client for OAuth2 authentication and field fetching.
 * Used by the admin UI to test connections and fetch available fields
 * for mapping configuration.
 */

import axios from 'axios'

/**
 * OAuth2 token response from the token endpoint
 */
export interface OAuth2TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

/**
 * Studio field definition from OpenSPP V2 API
 */
export interface StudioField {
  technicalName: string
  label: string
  fieldType: string
  targetType: 'individual' | 'group'
  helpText?: string
  isRequired?: boolean
  placementZone?: string
  apiExposed?: boolean
  isSearchable?: boolean
  selectionOptions?: Array<{ value: string; label: string }>
}

/**
 * Studio fields response from the API
 */
export interface StudioFieldsResponse {
  total: number
  items: StudioField[]
  nextPageId?: number
}

/**
 * Core field definition for Individual/Group resources
 * These are the built-in fields from the OpenSPP V2 schema
 */
export interface CoreField {
  name: string
  label: string
  type: string
  targetType: 'individual' | 'group' | 'both'
  required?: boolean
  nested?: boolean
  path?: string
}

/**
 * Combined field for mapping UI
 */
export interface OpenSppV2Field {
  name: string
  label: string
  type: string
  targetType: 'individual' | 'group' | 'both'
  required?: boolean
  source: 'core' | 'studio'
  selectionOptions?: Array<{ value: string; label: string }>
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
  scopes?: string[]
}

/**
 * Configuration for the OpenSPP V2 client
 */
export interface OpenSppV2ClientConfig {
  baseUrl: string
  clientId: string
  clientSecret: string
}

/**
 * Core fields available in Individual resources
 */
const INDIVIDUAL_CORE_FIELDS: CoreField[] = [
  { name: 'name.given', label: 'Given Name', type: 'string', targetType: 'individual', nested: true, path: 'name.given' },
  { name: 'name.family', label: 'Family Name', type: 'string', targetType: 'individual', nested: true, path: 'name.family' },
  { name: 'name.middle', label: 'Middle Name', type: 'string', targetType: 'individual', nested: true, path: 'name.middle' },
  { name: 'name.text', label: 'Full Name', type: 'string', targetType: 'individual', nested: true, path: 'name.text' },
  { name: 'birthDate', label: 'Birth Date', type: 'date', targetType: 'individual' },
  { name: 'birthDateEstimated', label: 'Birth Date Estimated', type: 'boolean', targetType: 'individual' },
  { name: 'gender', label: 'Gender', type: 'codeable-concept', targetType: 'individual' },
  { name: 'active', label: 'Active', type: 'boolean', targetType: 'individual' },
  { name: 'photo', label: 'Photo', type: 'base64', targetType: 'individual' },
  { name: 'telecom.phone', label: 'Phone', type: 'string', targetType: 'individual', nested: true },
  { name: 'telecom.email', label: 'Email', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.line', label: 'Address Line', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.city', label: 'City', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.district', label: 'District', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.state', label: 'State/Province', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.postalCode', label: 'Postal Code', type: 'string', targetType: 'individual', nested: true },
  { name: 'address.country', label: 'Country', type: 'string', targetType: 'individual', nested: true },
]

/**
 * Core fields available in Group resources
 */
const GROUP_CORE_FIELDS: CoreField[] = [
  { name: 'name', label: 'Group Name', type: 'string', targetType: 'group' },
  { name: 'groupType', label: 'Group Type', type: 'string', targetType: 'group' },
  { name: 'active', label: 'Active', type: 'boolean', targetType: 'group' },
  { name: 'quantity', label: 'Member Count', type: 'integer', targetType: 'group' },
  { name: 'address.line', label: 'Address Line', type: 'string', targetType: 'group', nested: true },
  { name: 'address.city', label: 'City', type: 'string', targetType: 'group', nested: true },
  { name: 'address.district', label: 'District', type: 'string', targetType: 'group', nested: true },
  { name: 'address.state', label: 'State/Province', type: 'string', targetType: 'group', nested: true },
  { name: 'address.postalCode', label: 'Postal Code', type: 'string', targetType: 'group', nested: true },
  { name: 'address.country', label: 'Country', type: 'string', targetType: 'group', nested: true },
]

/**
 * Test connection to OpenSPP V2 API via the backend.
 * The backend makes the OAuth2 request server-side, avoiding CORS.
 */
export async function testOpenSppV2Connection(
  config: OpenSppV2ClientConfig
): Promise<ConnectionTestResult> {
  try {
    const { default: api } = await import('./index').then((m) => ({ default: m.instance }))
    if (!api) throw new Error('API not initialized')

    const response = await api.post('/api/openspp-fields/v2/test-connection', {
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })

    return response.data as ConnectionTestResult
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error ? error.message : 'Connection failed'

    return { success: false, error: message }
  }
}

/**
 * Fetch all available fields from OpenSPP V2 API via the backend.
 * Returns core fields (hardcoded) and Studio custom fields (fetched server-side).
 */
export async function fetchOpenSppV2Fields(
  config: OpenSppV2ClientConfig
): Promise<{ fields: OpenSppV2Field[]; error?: string }> {
  // Core fields are known statically — no server call needed
  const fields: OpenSppV2Field[] = [
    ...INDIVIDUAL_CORE_FIELDS.map((f) => ({
      name: f.name, label: f.label, type: f.type, targetType: f.targetType,
      required: f.required, source: 'core' as const,
    })),
    ...GROUP_CORE_FIELDS.map((f) => ({
      name: f.name, label: f.label, type: f.type, targetType: f.targetType,
      required: f.required, source: 'core' as const,
    })),
  ]

  // Fetch Studio fields from the backend
  try {
    const { default: api } = await import('./index').then((m) => ({ default: m.instance }))
    if (!api) throw new Error('API not initialized')

    const response = await api.post('/api/openspp-fields/v2/fields', {
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })

    const studioFields = (response.data as { fields: OpenSppV2Field[] }).fields
    fields.push(...studioFields)
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error || error.message
      : error instanceof Error ? error.message : 'Failed to fetch fields'

    return { fields, error: message }
  }

  return { fields }
}
