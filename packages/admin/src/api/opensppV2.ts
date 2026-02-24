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

import axios, { type AxiosInstance } from 'axios'

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

const DEV_PROXY_KEY = 'datacollect:dev-proxy'

/**
 * Check if development proxy is enabled via UI toggle.
 */
function isDevProxyEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  return localStorage.getItem(`${DEV_PROXY_KEY}:enabled`) === 'true'
}

/**
 * Resolve the base URL for OpenSPP API calls.
 * In development mode with proxy enabled, routes through Vite dev server.
 */
function resolveBaseUrl(baseUrl: string): string {
  if (!import.meta.env.DEV) return baseUrl

  if (isDevProxyEnabled() && typeof window !== 'undefined') {
    return `${window.location.origin}/api/openspp-proxy`
  }

  return baseUrl
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
 * OpenSPP V2 API Client
 *
 * Handles OAuth2 authentication and field fetching for the admin UI.
 */
export class OpenSppV2Client {
  private config: OpenSppV2ClientConfig
  private axiosInstance: AxiosInstance
  private accessToken: string | null = null
  private tokenExpiresAt: number | null = null

  constructor(config: OpenSppV2ClientConfig) {
    this.config = config
    const baseUrl = resolveBaseUrl(config.baseUrl).replace(/\/+$/, '')
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
    })
  }

  /**
   * Authenticate with the OpenSPP V2 API using OAuth2 client credentials
   */
  async authenticate(): Promise<OAuth2TokenResponse> {
    const tokenUrl = '/api/v2/spp/oauth/token'

    const response = await this.axiosInstance.post<OAuth2TokenResponse>(
      tokenUrl,
      {
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    this.accessToken = response.data.access_token
    this.tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000

    return response.data
  }

  /**
   * Check if the current token is valid
   */
  private isTokenValid(): boolean {
    return !!(this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt)
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isTokenValid()) {
      await this.authenticate()
    }
  }

  /**
   * Make an authenticated request
   */
  private async request<T>(method: 'get' | 'post', url: string, data?: unknown): Promise<T> {
    await this.ensureAuthenticated()

    const response = await this.axiosInstance.request<T>({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    return response.data
  }

  /**
   * Fetch Studio fields from the API
   */
  async getStudioFields(
    targetType?: 'individual' | 'group',
    count = 100,
    lastId?: number
  ): Promise<StudioFieldsResponse> {
    const params = new URLSearchParams()
    params.set('api_exposed_only', 'true')
    params.set('_count', count.toString())

    if (targetType) {
      params.set('target_type', targetType)
    }
    if (lastId !== undefined) {
      params.set('_lastId', lastId.toString())
    }

    return this.request<StudioFieldsResponse>(
      'get',
      `/api/v2/spp/Studio/fields?${params.toString()}`
    )
  }

  /**
   * Get all available fields (core + studio) for mapping
   */
  async getAllFields(): Promise<OpenSppV2Field[]> {
    const fields: OpenSppV2Field[] = []

    // Add core Individual fields
    for (const field of INDIVIDUAL_CORE_FIELDS) {
      fields.push({
        name: field.name,
        label: field.label,
        type: field.type,
        targetType: field.targetType,
        required: field.required,
        source: 'core',
      })
    }

    // Add core Group fields
    for (const field of GROUP_CORE_FIELDS) {
      fields.push({
        name: field.name,
        label: field.label,
        type: field.type,
        targetType: field.targetType,
        required: field.required,
        source: 'core',
      })
    }

    // Fetch Studio fields
    try {
      let lastId: number | undefined
      let hasMore = true

      while (hasMore) {
        const response = await this.getStudioFields(undefined, 100, lastId)

        for (const studioField of response.items) {
          fields.push({
            name: `extension.${studioField.technicalName}`,
            label: studioField.label,
            type: studioField.fieldType,
            targetType: studioField.targetType,
            required: studioField.isRequired,
            source: 'studio',
            selectionOptions: studioField.selectionOptions,
          })
        }

        if (response.nextPageId) {
          lastId = response.nextPageId
        } else {
          hasMore = false
        }
      }
    } catch (error) {
      // Studio fields are optional, continue with core fields only
      console.warn('Failed to fetch Studio fields:', error)
    }

    return fields
  }
}

/**
 * Test connection to OpenSPP V2 API
 *
 * Attempts to authenticate and returns the result.
 */
export async function testOpenSppV2Connection(
  config: OpenSppV2ClientConfig
): Promise<ConnectionTestResult> {
  try {
    const client = new OpenSppV2Client(config)
    const tokenResponse = await client.authenticate()

    return {
      success: true,
      scopes: tokenResponse.scope?.split(' ') || [],
    }
  } catch (error) {
    let errorMessage = 'Connection failed'

    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status
        const data = error.response.data as { detail?: string; title?: string; message?: string }

        if (status === 401) {
          errorMessage = 'Invalid client credentials'
        } else if (status === 403) {
          errorMessage = 'Access denied - check client permissions'
        } else if (status === 404) {
          errorMessage = 'API endpoint not found - check the URL'
        } else if (data?.detail) {
          errorMessage = data.detail
        } else if (data?.title) {
          errorMessage = data.title
        } else if (data?.message) {
          errorMessage = data.message
        } else {
          errorMessage = `Server error (${status})`
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused - check the URL'
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Server not found - check the URL'
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timed out'
      } else if (error.message) {
        errorMessage = error.message
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Fetch all available fields from OpenSPP V2 API
 *
 * Returns core fields and Studio custom fields.
 */
export async function fetchOpenSppV2Fields(
  config: OpenSppV2ClientConfig
): Promise<{ fields: OpenSppV2Field[]; error?: string }> {
  try {
    const client = new OpenSppV2Client(config)
    const fields = await client.getAllFields()

    return { fields }
  } catch (error) {
    let errorMessage = 'Failed to fetch fields'

    if (axios.isAxiosError(error)) {
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.message) {
        errorMessage = error.message
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    return {
      fields: [],
      error: errorMessage,
    }
  }
}
