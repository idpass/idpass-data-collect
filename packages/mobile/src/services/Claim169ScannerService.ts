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

import { ref } from 'vue'
import type { VerifiedIdentity } from './claim169Service'

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

// Global state for the scanner overlay
const isOpen = ref(false)
const options = ref<ScanOptions>({})
const resolveScan = ref<((value: VerifiedIdentity | null) => void) | null>(null)

export const Claim169ScannerService = {
  // Observable state
  isOpen,
  options,

  /**
   * Open the scanner overlay and wait for a result
   */
  scan(scanOptions: ScanOptions = {}): Promise<VerifiedIdentity | null> {
    return new Promise((resolve) => {
      // Close any existing scan first
      if (isOpen.value && resolveScan.value) {
        resolveScan.value(null)
      }

      options.value = scanOptions
      resolveScan.value = resolve
      isOpen.value = true
    })
  },

  /**
   * Called by the overlay when a scan is successful
   */
  complete(result: VerifiedIdentity) {
    if (resolveScan.value) {
      resolveScan.value(result)
      resolveScan.value = null
    }
    isOpen.value = false
  },

  /**
   * Called by the overlay when cancelled
   */
  cancel() {
    if (resolveScan.value) {
      resolveScan.value(null)
      resolveScan.value = null
    }
    isOpen.value = false
  }
}
