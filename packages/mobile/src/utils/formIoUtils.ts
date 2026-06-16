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

export interface FieldMapping {
  formField: string
  opensppField: string
  transformer: {
    type: 'text' | 'date' | 'id' | 'multiselect' | 'boolean'
    options?: {
      inputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'auto'
      outputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY'
      delimiter?: string
      truthyValue?: string
      falsyValue?: string
    }
  }
}

export interface ExternalSync {
  type?: string
  url?: string
  extraFields?: unknown[]
  fieldMappings?: FieldMapping[]
}

export interface Program {
  /** OpenSPP `spp.program` primary key — sent as `detail.program_id` on `assign_program` CRs. */
  id: number
  /** Display label for the enrolment chooser. */
  name: string
  /** Optional short code shown next to the name. */
  code?: string
}

export interface Claim169Config {
  enabled: boolean
  trustedIssuers: TrustedIssuer[]
}

export interface InjiTrustedIssuer {
  issuerId: string
  /** Optional JWK `kid` to disambiguate multiple keys for one issuer. */
  kid?: string
  publicKey: {
    ed25519?: string
    es256?: string
  }
}

export interface InjiCredentialTemplate {
  id: string
  /** VC `type` values a credential must contain to satisfy this template. */
  matchTypes: string[]
  expectedFormat: 'jwt-vc' | 'sd-jwt' | 'ldp_vc'
  /** Optional issuer allowlist scoping this template. */
  allowedIssuers?: string[]
  /** Optional human label surfaced in the scan overlay. */
  claimLabel?: string
}

export interface InjiConfig {
  enabled: boolean
  trustedIssuers: InjiTrustedIssuer[]
  credentialTemplates: InjiCredentialTemplate[]
}

export interface Config {
  id: string
  name: string
  description: string
  version: string
  url: string
  entityForms: EntityForm[]
  entityData: EntityData[]
  syncServerUrl: string
  externalSync?: ExternalSync
  authConfigs?: Record<string, unknown>[]
  /**
   * Programs available for enrolment via the OpenSPP `assign_program` CR
   * workflow. Empty/omitted hides the mobile "Enrol in Program" action.
   */
  programs?: Program[]
  /**
   * Tenant-level Claim-169 configuration. Replaces the legacy top-level
   * `trustedIssuers` field (schema v2). Form-embedded `claim169Scanner`
   * components still keep their own embedded trustedIssuers list.
   */
  claim169?: Claim169Config
  /**
   * Tenant-level Inji wallet per-field verification config (schema v3).
   * Drives the form-field "Verify" affordance + offline VC trust registry.
   */
  inji?: InjiConfig
}

export interface TrustedIssuer {
  issuerId: string
  publicKey: {
    ed25519?: string // Base64 encoded
    es256?: string // Base64 encoded
  }
}

export interface EntityForm {
  name: string
  title: string
  displayTemplate: string
  description?: string
  dependsOn?: string
  entityType?: 'group' | 'individual' | 'record'
  nameField?: string
  formio?: unknown
}

export interface EntityData {
  name: string
  data: Record<string, unknown>[]
}

export function getBreadcrumb(...args: string[]) {
  return args.join(' > ')
}

export function getBreadcrumbFromPath(path: string) {
  //remove the first / and the first route param
  path = path.slice(1)
  let routeParams = path.split('/').slice(1)

  // remove detail from the routeParams
  routeParams = routeParams.filter((param) => param !== 'detail')
  return routeParams.join(' > ')
}

export function extractParentUUIDInPath(url: string) {
  const parts = url.split('/')
  const filteredParts = parts.filter((part) => part !== '')
  const detailIndices = []

  // Find all indices of "detail"
  filteredParts.forEach((part, index) => {
    if (part === 'detail') {
      detailIndices.push(index)
    }
  })

  if (detailIndices.length > 0) {
    // Get the index of the *last* "detail"
    const lastDetailIndex = detailIndices[detailIndices.length - 1]

    if (lastDetailIndex > 0) {
      // The UUID is the part immediately before the last "detail"
      return filteredParts[lastDetailIndex - 1]
    }
  }

  return null // UUID not found before the last "detail"
}
