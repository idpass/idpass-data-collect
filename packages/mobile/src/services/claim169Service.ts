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

import type { EntityType } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'

// Lazy-load the claim169 module to avoid WASM initialization issues on mobile
let claim169Module: typeof import('claim169') | null = null

async function getClaim169Module(): Promise<typeof import('claim169')> {
  if (!claim169Module) {
    claim169Module = await import('claim169')
  }
  return claim169Module
}

// Gender enum values from Claim-169 spec
export enum Claim169Gender {
  Male = 1,
  Female = 2,
  Other = 3
}

// Image format enum from Claim-169 spec (1-based, matching WASM library output)
export enum Claim169ImageFormat {
  Jpeg = 1,
  Jpeg2000 = 2,
  Avif = 3,
  Webp = 4
}

// Marital status enum from Claim-169 spec
export enum Claim169MaritalStatus {
  Single = 1,
  Married = 2,
  Divorced = 3,
  Widowed = 4,
  Separated = 5,
  Other = 6
}

// Identity data structure from decoded Claim-169 QR
export interface Claim169IdentityData {
  // Core identity fields
  id?: string
  version?: string
  language?: string

  // Name fields
  fullName?: string
  firstName?: string
  middleName?: string
  lastName?: string

  // Date fields (ISO 8601 format string)
  dateOfBirth?: string

  // Demographic fields
  gender?: number
  maritalStatus?: number
  nationality?: string

  // Address field
  address?: string

  // Contact fields
  phone?: string
  email?: string

  // Biometric data
  photo?: Uint8Array
  photoFormat?: number
  bestQualityFingers?: Uint8Array

  // Guardian info (for minors)
  guardian?: string

  // Additional fields
  secondaryFullName?: string
  secondaryLanguage?: string
  locationCode?: string
  legalStatus?: string
  countryOfIssuance?: string
}

// CWT (CBOR Web Token) metadata
export interface Claim169CwtMeta {
  issuer?: string
  subject?: string
  issuedAt?: number
  expiresAt?: number
  notBefore?: number
}

// Result of decoding and verifying a Claim-169 QR code
export interface VerifiedIdentity {
  isVerified: boolean
  isExpired: boolean
  identity: Claim169IdentityData
  cwt: Claim169CwtMeta
  rawData?: string
}

// Options for decoding
export interface DecodeOptions {
  ed25519PublicKey?: Uint8Array
  es256PublicKey?: Uint8Array
  skipVerification?: boolean
}

// Known issuer public keys (mutable registry)
const ISSUER_KEY_REGISTRY: Map<string, { ed25519?: Uint8Array; es256?: Uint8Array }> = new Map()

/**
 * Register a trusted issuer key
 */
export function registerIssuerKey(
  issuerId: string,
  keys: { ed25519?: Uint8Array | string; es256?: Uint8Array | string }
): void {
  if (!keys || (!keys.ed25519 && !keys.es256)) {
    return
  }

  const parsedKeys: { ed25519?: Uint8Array; es256?: Uint8Array } = {}

  if (keys.ed25519) {
    parsedKeys.ed25519 =
      typeof keys.ed25519 === 'string'
        ? Uint8Array.from(atob(keys.ed25519), (c) => c.charCodeAt(0))
        : keys.ed25519
  }

  if (keys.es256) {
    parsedKeys.es256 =
      typeof keys.es256 === 'string'
        ? Uint8Array.from(atob(keys.es256), (c) => c.charCodeAt(0))
        : keys.es256
  }

  ISSUER_KEY_REGISTRY.set(issuerId, parsedKeys)
}

/**
 * Get issuer public key by issuer ID
 */
export function getIssuerPublicKey(
  issuerId: string
): { ed25519?: Uint8Array; es256?: Uint8Array } | undefined {
  return ISSUER_KEY_REGISTRY.get(issuerId)
}

/**
 * Convert Claim-169 gender code to string
 */
export function genderToString(gender: number | undefined): string | undefined {
  if (gender === undefined) return undefined
  switch (gender) {
    case Claim169Gender.Male:
      return 'male'
    case Claim169Gender.Female:
      return 'female'
    case Claim169Gender.Other:
      return 'other'
    default:
      return undefined
  }
}

/**
 * Convert image format code to MIME type
 */
export function imageFormatToMimeType(format: number | undefined): string {
  switch (format) {
    case Claim169ImageFormat.Jpeg:
      return 'image/jpeg'
    case Claim169ImageFormat.Jpeg2000:
      return 'image/jp2'
    case Claim169ImageFormat.Avif:
      return 'image/avif'
    case Claim169ImageFormat.Webp:
      return 'image/webp'
    default:
      return 'image/jpeg'
  }
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decode and verify a Claim-169 QR code
 */
export async function decodeAndVerifyClaim169(
  qrContent: string,
  options: DecodeOptions = {}
): Promise<VerifiedIdentity> {
  const { ed25519PublicKey, es256PublicKey, skipVerification = false } = options

  // Lazily load the claim169 module (WASM)
  const { Decoder } = await getClaim169Module()

  let isVerified = false

  // Attempt verification if keys are provided
  // Note: The Decoder is consumed by verification methods, so we need fresh instances for each attempt
  if (!skipVerification) {
    if (ed25519PublicKey) {
      try {
        const verifyDecoder = new Decoder(qrContent).verifyWithEd25519(ed25519PublicKey)
        const decoded = verifyDecoder.decode()
        isVerified = true
        return buildVerifiedIdentity(decoded, isVerified, qrContent)
      } catch {
        // Ed25519 verification failed; fall through to next method
      }
    }

    if (!isVerified && es256PublicKey) {
      try {
        const verifyDecoder = new Decoder(qrContent).verifyWithEcdsaP256(es256PublicKey)
        const decoded = verifyDecoder.decode()
        isVerified = true
        return buildVerifiedIdentity(decoded, isVerified, qrContent)
      } catch {
        // ES256 verification failed; fall through to auto-verify
      }
    }

    // Auto-verify with known issuer keys if explicit keys weren't provided or failed
    if (!isVerified) {
      try {
        const tempDecoder = new Decoder(qrContent).allowUnverified()
        const tempDecoded = tempDecoder.decode()
        const issuer = tempDecoded.cwtMeta?.issuer

        if (issuer) {
          const keys = getIssuerPublicKey(issuer)
          if (keys) {
            if (keys.ed25519 && keys.ed25519.length === 32) {
              try {
                const verifyDecoder = new Decoder(qrContent).verifyWithEd25519(keys.ed25519)
                const decoded = verifyDecoder.decode()
                isVerified = true
                return buildVerifiedIdentity(decoded, isVerified, qrContent)
              } catch {
                // Ed25519 auto-verify failed; try ES256
              }
            }
            if (!isVerified && keys.es256) {
              try {
                const verifyDecoder = new Decoder(qrContent).verifyWithEcdsaP256(keys.es256)
                const decoded = verifyDecoder.decode()
                isVerified = true
                return buildVerifiedIdentity(decoded, isVerified, qrContent)
              } catch {
                // ES256 auto-verify failed
              }
            }
          }
        }
      } catch {
        // Failed to peek issuer for auto-verification
      }
    }
  }

  // No verification was performed or requested; allow unverified decode
  const decoder = new Decoder(qrContent).allowUnverified()

  // Decode the QR content
  const decoded = decoder.decode()
  return buildVerifiedIdentity(decoded, isVerified, qrContent)
}

/**
 * Helper to build VerifiedIdentity from decoded data
 */
function buildVerifiedIdentity(
  decoded: { claim169?: any; cwtMeta?: any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  isVerified: boolean,
  qrContent: string
): VerifiedIdentity {
  const claim = decoded.claim169
  const cwt = decoded.cwtMeta

  // Check expiration
  const now = Math.floor(Date.now() / 1000)
  const isExpired = cwt?.expiresAt ? cwt.expiresAt < now : false

  // Build identity data
  const identity: Claim169IdentityData = {
    id: claim?.id,
    version: claim?.version,
    language: claim?.language,
    fullName: claim?.fullName,
    firstName: claim?.firstName,
    middleName: claim?.middleName,
    lastName: claim?.lastName,
    dateOfBirth: claim?.dateOfBirth,
    gender: claim?.gender,
    maritalStatus: claim?.maritalStatus,
    nationality: claim?.nationality,
    address: claim?.address,
    phone: claim?.phone,
    email: claim?.email,
    photo: claim?.photo,
    photoFormat: claim?.photoFormat,
    bestQualityFingers: claim?.bestQualityFingers,
    guardian: claim?.guardian,
    secondaryFullName: claim?.secondaryFullName,
    secondaryLanguage: claim?.secondaryLanguage,
    locationCode: claim?.locationCode,
    legalStatus: claim?.legalStatus,
    countryOfIssuance: claim?.countryOfIssuance
  }

  // Build CWT metadata
  const cwtMeta: Claim169CwtMeta = {
    issuer: cwt?.issuer,
    subject: cwt?.subject,
    issuedAt: cwt?.issuedAt,
    expiresAt: cwt?.expiresAt,
    notBefore: cwt?.notBefore
  }

  return {
    isVerified,
    isExpired,
    identity,
    cwt: cwtMeta,
    rawData: qrContent
  }
}

// Extended entity data with claim169 fields
export interface Claim169EntityData {
  entityType: EntityType
  guid: string
  fullName?: string
  firstName?: string
  lastName?: string
  dateOfBirth?: string
  gender?: string
  nationality?: string
  address?: string
  phone?: string
  email?: string
  photo?: string
  bestQualityFingers?: number[]
  metadata?: {
    claim169?: {
      isVerified: boolean
      isExpired: boolean
      issuer?: string
      issuedAt?: number
      expiresAt?: number
      guardian?: string
      maritalStatus?: number
      secondaryFullName?: string
      locationCode?: string
      legalStatus?: string
      countryOfIssuance?: string
    }
  }
}

/**
 * Map Claim-169 identity data to the entity data model
 */
export function mapClaim169ToEntityData(
  verifiedIdentity: VerifiedIdentity
): Claim169EntityData {
  const { identity } = verifiedIdentity

  // Build photo data URL if photo exists
  let photoDataUrl: string | undefined
  if (identity.photo && identity.photo.length > 0) {
    const mimeType = imageFormatToMimeType(identity.photoFormat)
    const base64 = uint8ArrayToBase64(identity.photo)
    photoDataUrl = `data:${mimeType};base64,${base64}`
  }

  return {
    entityType: 'individual' as EntityType,
    guid: identity.id || uuidv4(),
    fullName: identity.fullName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    dateOfBirth: identity.dateOfBirth,
    gender: genderToString(identity.gender),
    nationality: identity.nationality,
    address: identity.address,
    phone: identity.phone,
    email: identity.email,
    photo: photoDataUrl,
    bestQualityFingers: identity.bestQualityFingers
      ? Array.from(identity.bestQualityFingers)
      : undefined,
    // Store additional Claim-169 specific data in metadata
    metadata: {
      claim169: {
        isVerified: verifiedIdentity.isVerified,
        isExpired: verifiedIdentity.isExpired,
        issuer: verifiedIdentity.cwt.issuer,
        issuedAt: verifiedIdentity.cwt.issuedAt,
        expiresAt: verifiedIdentity.cwt.expiresAt,
        guardian: identity.guardian,
        maritalStatus: identity.maritalStatus,
        secondaryFullName: identity.secondaryFullName,
        locationCode: identity.locationCode,
        legalStatus: identity.legalStatus,
        countryOfIssuance: identity.countryOfIssuance
      }
    }
  }
}
