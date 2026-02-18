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

export interface ScannedIdentifier {
  type: string // e.g. 'claim169_id', 'national_id', 'registration_number'
  value: string
}

export interface ScannedIdentity {
  decoderId: string
  // Primary identifier (most common case is exactly one)
  primaryId?: string
  // Core identity fields (superset of Claim-169)
  fullName?: string
  firstName?: string
  middleName?: string
  lastName?: string
  dateOfBirth?: string // ISO 8601
  gender?: string // 'male' | 'female' | 'other'
  nationality?: string
  address?: string
  phone?: string
  email?: string
  photo?: string // data URI (base64-encoded)
  // Additional structured identifiers
  identifiers: ScannedIdentifier[]
  // Verification metadata
  verification: {
    isVerified: boolean
    isExpired: boolean
    issuer?: string
    issuedAt?: number
    expiresAt?: number
  }
  // Decoder-specific raw payload
  rawData?: unknown
  extra: Record<string, unknown>
}

// --- Decoder plugin ---

export interface DecoderPluginMeta {
  id: string // 'claim169', 'inji-verify', 'plain-qr'
  label: string // 'Identity QR (Claim-169)'
  icon: string // SVG path data for picker
  description?: string
  inputType: 'qr' | 'barcode' | 'nfc' // what hardware capture method to use
}

export interface DecoderPlugin {
  meta: DecoderPluginMeta
  /**
   * Optional one-time configuration hook called before decode().
   * Use this for side effects like registering trusted issuers,
   * so that decode() remains a pure transformation.
   */
  configure?(config: Record<string, unknown>): void
  /**
   * Attempt to decode raw captured content into a ScannedIdentity.
   * Returns null if this decoder cannot handle the content.
   * Throws on decode errors (malformed data, verification failure, etc.)
   */
  decode(
    rawContent: string,
    config: Record<string, unknown>
  ): Promise<ScannedIdentity | null>
}

// --- Entity matching ---

export interface MatchResult {
  entity: { guid: string; data: Record<string, unknown>; name?: string }
  score: number // 0.0 - 1.0
  matchedField: string // field name that matched (for UI display)
  matchedValue: string // the value that matched
}

// --- Config types (live in tenant JSON on EntityForm) ---

export interface ScannerMatchConfig {
  identifierField?: string // entity data field to match against (default: 'externalId')
  nameField?: string // entity data field for name matching (default: 'name')
  dateOfBirthField?: string // entity data field for DOB matching (default: 'dateOfBirth')
}

export interface ScannerConfig {
  decoderId: string
  config?: Record<string, unknown> // decoder-specific (trustedIssuers, etc.)
  match?: ScannerMatchConfig // matching config for this decoder
}
