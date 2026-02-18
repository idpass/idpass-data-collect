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

import {
  decodeAndVerifyClaim169,
  registerIssuerKey,
  genderToString,
  imageFormatToMimeType
} from '../../services/claim169Service'
import type { VerifiedIdentity } from '../../services/claim169Service'
import type { DecoderPlugin, ScannedIdentity } from '../types'

interface TrustedIssuerConfig {
  issuerId: string
  ed25519Key?: string
  es256Key?: string
}

function photoToDataUri(photo: Uint8Array, photoFormat?: number): string {
  const mimeType = imageFormatToMimeType(photoFormat)
  let binary = ''
  for (let i = 0; i < photo.length; i++) {
    binary += String.fromCharCode(photo[i])
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

function mapVerifiedIdentityToScanned(
  verified: VerifiedIdentity
): ScannedIdentity {
  const { identity, cwt } = verified

  const identifiers: ScannedIdentity['identifiers'] = []
  if (identity.id) {
    identifiers.push({ type: 'claim169_id', value: identity.id })
  }

  // Build extra fields from identity data not covered by core ScannedIdentity fields
  const extra: Record<string, unknown> = {}
  if (identity.guardian !== undefined) extra.guardian = identity.guardian
  if (identity.maritalStatus !== undefined)
    extra.maritalStatus = identity.maritalStatus
  if (identity.secondaryFullName !== undefined)
    extra.secondaryFullName = identity.secondaryFullName
  if (identity.secondaryLanguage !== undefined)
    extra.secondaryLanguage = identity.secondaryLanguage
  if (identity.locationCode !== undefined)
    extra.locationCode = identity.locationCode
  if (identity.legalStatus !== undefined)
    extra.legalStatus = identity.legalStatus
  if (identity.countryOfIssuance !== undefined)
    extra.countryOfIssuance = identity.countryOfIssuance
  if (identity.version !== undefined) extra.version = identity.version
  if (identity.language !== undefined) extra.language = identity.language
  if (identity.bestQualityFingers !== undefined)
    extra.bestQualityFingers = Array.from(identity.bestQualityFingers)

  let photo: string | undefined
  if (identity.photo && identity.photo.length > 0) {
    photo = photoToDataUri(identity.photo, identity.photoFormat)
  }

  return {
    decoderId: 'claim169',
    primaryId: identity.id,
    fullName: identity.fullName,
    firstName: identity.firstName,
    middleName: identity.middleName,
    lastName: identity.lastName,
    dateOfBirth: identity.dateOfBirth,
    gender: genderToString(identity.gender),
    nationality: identity.nationality,
    address: identity.address,
    phone: identity.phone,
    email: identity.email,
    photo,
    identifiers,
    verification: {
      isVerified: verified.isVerified,
      isExpired: verified.isExpired,
      issuer: cwt.issuer,
      issuedAt: cwt.issuedAt,
      expiresAt: cwt.expiresAt
    },
    rawData: verified,
    extra
  }
}

export const Claim169Decoder: DecoderPlugin = {
  meta: {
    id: 'claim169',
    label: 'Identity QR (Claim-169)',
    icon: 'M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM19 13v1.5h-1.5V13H19z',
    description: 'Decode and verify MOSIP Claim-169 identity QR codes',
    inputType: 'qr'
  },

  async decode(
    rawContent: string,
    config: Record<string, unknown>
  ): Promise<ScannedIdentity | null> {
    // Register trusted issuers from config if provided
    const trustedIssuers = config.trustedIssuers as
      | TrustedIssuerConfig[]
      | undefined
    if (trustedIssuers && trustedIssuers.length > 0) {
      for (const issuer of trustedIssuers) {
        if (issuer.issuerId) {
          registerIssuerKey(issuer.issuerId, {
            ed25519: issuer.ed25519Key,
            es256: issuer.es256Key
          })
        }
      }
    }

    const verified = await decodeAndVerifyClaim169(rawContent)
    return mapVerifiedIdentityToScanned(verified)
  }
}
