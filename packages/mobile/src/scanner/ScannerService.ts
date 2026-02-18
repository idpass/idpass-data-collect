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
import type { Ref } from 'vue'
import { getDecoder } from './ScannerRegistry'
import type { DecoderPlugin, ScannedIdentity, ScannerConfig } from './types'

export type ScannerState = 'closed' | 'picker' | 'scanning' | 'decoding'

// Global state for the scanner overlay
const state: Ref<ScannerState> = ref('closed')
const activeDecoder: Ref<DecoderPlugin | null> = ref(null)
const activeConfig: Ref<Record<string, unknown>> = ref({})
const availableDecoders: Ref<ScannerConfig[]> = ref([])
const lastError: Ref<string> = ref('')

let resolveScan: ((value: ScannedIdentity | null) => void) | null = null

export const ScannerService = {
  // Observable state
  state,
  activeDecoder,
  activeConfig,
  availableDecoders,
  lastError,

  /**
   * Open the scanner and wait for a result.
   * If a single decoder is configured, skips the picker and goes directly to scanning.
   * If multiple decoders are configured, shows the picker first.
   */
  scan(scanners: ScannerConfig[]): Promise<ScannedIdentity | null> {
    return new Promise((resolve) => {
      // Close any existing scan first
      if (state.value !== 'closed' && resolveScan) {
        resolveScan(null)
      }

      lastError.value = ''
      availableDecoders.value = scanners
      resolveScan = resolve

      if (scanners.length === 1) {
        // Single decoder: skip picker, go directly to scanning
        const config = scanners[0]
        const decoder = getDecoder(config.decoderId)
        if (decoder) {
          activeDecoder.value = decoder
          activeConfig.value = config.config ?? {}
          state.value = 'scanning'
        } else {
          lastError.value = `Decoder "${config.decoderId}" not found`
          resolveScan(null)
          resolveScan = null
        }
      } else if (scanners.length > 1) {
        // Multiple decoders: show picker
        state.value = 'picker'
      } else {
        // No scanners configured
        resolveScan(null)
        resolveScan = null
      }
    })
  },

  /**
   * Called by the picker when a decoder is selected.
   * Transitions from 'picker' to 'scanning'.
   */
  selectDecoder(decoderId: string): void {
    const scannerConfig = availableDecoders.value.find(
      (s) => s.decoderId === decoderId
    )
    const decoder = getDecoder(decoderId)
    if (decoder && scannerConfig) {
      activeDecoder.value = decoder
      activeConfig.value = scannerConfig.config ?? {}
      lastError.value = ''
      state.value = 'scanning'
    }
  },

  /**
   * Called by the overlay when a raw barcode/QR is captured.
   * Transitions from 'scanning' to 'decoding', calls decoder.decode(),
   * then resolves the promise.
   */
  async handleRawCapture(rawContent: string): Promise<void> {
    if (!activeDecoder.value) return

    state.value = 'decoding'
    lastError.value = ''

    try {
      const result = await activeDecoder.value.decode(rawContent, activeConfig.value)
      if (result) {
        ScannerService.complete(result)
      } else {
        lastError.value = 'Decoder could not process the scanned content'
        state.value = 'scanning'
      }
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : 'Failed to decode scanned content'
      state.value = 'scanning'
    }
  },

  /**
   * Complete the scan with a result. Resolves the promise and closes.
   */
  complete(result: ScannedIdentity): void {
    if (resolveScan) {
      resolveScan(result)
      resolveScan = null
    }
    activeDecoder.value = null
    activeConfig.value = {}
    state.value = 'closed'
  },

  /**
   * Cancel the scan. Resolves the promise with null and closes.
   */
  cancel(): void {
    if (resolveScan) {
      resolveScan(null)
      resolveScan = null
    }
    activeDecoder.value = null
    activeConfig.value = {}
    lastError.value = ''
    state.value = 'closed'
  }
}
