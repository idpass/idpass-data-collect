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

import { ref, watch } from 'vue'
import type { VerifiedIdentity } from './claim169Service'
import { ScannerService } from '@/scanner/ScannerService'
import type { ScannedIdentity, ScannerConfig } from '@/scanner/types'

// Trusted issuer configuration
export interface TrustedIssuer {
  issuerId: string
  ed25519Key?: string
  es256Key?: string
}

// Types for the scanner service
export interface ScanOptions {
  title?: string
  description?: string
  trustedIssuers?: TrustedIssuer[]
  validate?: (identity: VerifiedIdentity) => Promise<boolean | string>
}

// isOpen mirrors ScannerService.state (true when not 'closed')
const isOpen = ref(false)

// Kept for backward compatibility with callers that read options
const options = ref<ScanOptions>({})

// Keep isOpen in sync with ScannerService.state
watch(ScannerService.state, (newState) => {
  isOpen.value = newState !== 'closed'
})

/**
 * Convert a TrustedIssuer array into the decoder config format expected by
 * Claim169Decoder (an array of { issuerId, ed25519Key?, es256Key? }).
 */
function buildDecoderConfig(
  trustedIssuers?: TrustedIssuer[]
): Record<string, unknown> {
  if (!trustedIssuers || trustedIssuers.length === 0) {
    return {}
  }
  return {
    trustedIssuers: trustedIssuers.map((issuer) => ({
      issuerId: issuer.issuerId,
      ed25519Key: issuer.ed25519Key,
      es256Key: issuer.es256Key
    }))
  }
}

export const Claim169ScannerService = {
  // Observable state
  isOpen,
  options,

  /**
   * Open the scanner overlay and wait for a result.
   * Delegates to ScannerService using the 'claim169' decoder.
   */
  async scan(scanOptions: ScanOptions = {}): Promise<VerifiedIdentity | null> {
    options.value = scanOptions

    const scannerConfig: ScannerConfig = {
      decoderId: 'claim169',
      config: buildDecoderConfig(scanOptions.trustedIssuers)
    }

    const result: ScannedIdentity | null = await ScannerService.scan([scannerConfig])

    if (!result) {
      return null
    }

    // Claim169Decoder stores the full VerifiedIdentity in rawData
    return (result.rawData as VerifiedIdentity) ?? null
  },

  /**
   * Called by the old overlay when a scan is successful.
   * Accepts VerifiedIdentity (old API) and wraps it in a ScannedIdentity
   * before delegating to ScannerService.
   */
  complete(result: VerifiedIdentity) {
    const scanned: ScannedIdentity = {
      decoderId: 'claim169',
      primaryId: result.identity?.id,
      fullName: result.identity?.fullName,
      identifiers: result.identity?.id
        ? [{ type: 'claim169_id', value: result.identity.id }]
        : [],
      verification: {
        isVerified: result.isVerified,
        isExpired: result.isExpired,
        issuer: result.cwt?.issuer,
        issuedAt: result.cwt?.issuedAt,
        expiresAt: result.cwt?.expiresAt
      },
      rawData: result,
      extra: {}
    }
    ScannerService.complete(scanned)
  },

  /**
   * Called by the overlay when cancelled.
   * Delegates to ScannerService.
   */
  cancel() {
    ScannerService.cancel()
  }
}
