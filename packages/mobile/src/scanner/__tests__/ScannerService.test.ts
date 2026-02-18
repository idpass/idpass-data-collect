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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ScannerService, _resetForTesting } from '../ScannerService'
import { registerDecoder, clearDecoders } from '../ScannerRegistry'
import type { DecoderPlugin, ScannedIdentity, ScannerConfig } from '../types'

function createMockDecoder(id: string, decodeFn?: DecoderPlugin['decode']): DecoderPlugin {
  return {
    meta: {
      id,
      label: `Mock ${id}`,
      icon: '',
      description: `Mock decoder ${id}`,
      inputType: 'qr'
    },
    decode: decodeFn ?? vi.fn(async () => null)
  }
}

function createScanResult(decoderId: string): ScannedIdentity {
  return {
    decoderId,
    primaryId: '123',
    identifiers: [],
    verification: { isVerified: false, isExpired: false },
    extra: {}
  }
}

describe('ScannerService', () => {
  beforeEach(() => {
    clearDecoders()
    _resetForTesting()
  })

  describe('scan() with single decoder', () => {
    it('skips picker and goes directly to scanning state', () => {
      const decoder = createMockDecoder('test')
      registerDecoder(decoder)

      const config: ScannerConfig[] = [{ decoderId: 'test' }]
      ScannerService.scan(config)

      expect(ScannerService.state.value).toBe('scanning')
      expect(ScannerService.activeDecoder.value?.meta.id).toBe(decoder.meta.id)
    })
  })

  describe('scan() with multiple decoders', () => {
    it('shows picker state', () => {
      registerDecoder(createMockDecoder('decoder-a'))
      registerDecoder(createMockDecoder('decoder-b'))

      const config: ScannerConfig[] = [
        { decoderId: 'decoder-a' },
        { decoderId: 'decoder-b' }
      ]
      ScannerService.scan(config)

      expect(ScannerService.state.value).toBe('picker')
      expect(ScannerService.availableDecoders.value).toEqual(config)
    })
  })

  describe('scan() with empty scanners array', () => {
    it('resolves null immediately and stays closed', async () => {
      const result = await ScannerService.scan([])

      expect(result).toBeNull()
      expect(ScannerService.state.value).toBe('closed')
    })
  })

  describe('scan() with unknown decoder ID', () => {
    it('resolves null with error message', async () => {
      const config: ScannerConfig[] = [{ decoderId: 'nonexistent' }]
      const result = await ScannerService.scan(config)

      expect(result).toBeNull()
      expect(ScannerService.lastError.value).toBe(
        'Scanner type is not available. Please contact your administrator.'
      )
    })
  })

  describe('selectDecoder()', () => {
    it('transitions from picker to scanning', () => {
      const decoder = createMockDecoder('decoder-a')
      registerDecoder(decoder)
      registerDecoder(createMockDecoder('decoder-b'))

      const config: ScannerConfig[] = [
        { decoderId: 'decoder-a', config: { key: 'value' } },
        { decoderId: 'decoder-b' }
      ]
      ScannerService.scan(config)
      expect(ScannerService.state.value).toBe('picker')

      ScannerService.selectDecoder('decoder-a')

      expect(ScannerService.state.value).toBe('scanning')
      expect(ScannerService.activeDecoder.value?.meta.id).toBe(decoder.meta.id)
      expect(ScannerService.activeConfig.value).toEqual({ key: 'value' })
    })
  })

  describe('handleRawCapture()', () => {
    it('resolves the promise and closes on successful decode', async () => {
      const expected = createScanResult('test')
      const decoder = createMockDecoder('test', vi.fn(async () => expected))
      registerDecoder(decoder)

      const promise = ScannerService.scan([{ decoderId: 'test' }])
      await ScannerService.handleRawCapture('raw-data')

      const result = await promise
      expect(result).toBe(expected)
      expect(ScannerService.state.value).toBe('closed')
    })

    it('goes back to scanning with error when decoder returns null', async () => {
      const decoder = createMockDecoder('test', vi.fn(async () => null))
      registerDecoder(decoder)

      ScannerService.scan([{ decoderId: 'test' }])
      await ScannerService.handleRawCapture('raw-data')

      expect(ScannerService.state.value).toBe('scanning')
      expect(ScannerService.lastError.value).toBe(
        'The scanned code could not be read. Please try again with a clear QR code.'
      )
    })

    it('goes back to scanning with error when decoder throws', async () => {
      const decoder = createMockDecoder(
        'test',
        vi.fn(async () => {
          throw new Error('decode failure')
        })
      )
      registerDecoder(decoder)

      ScannerService.scan([{ decoderId: 'test' }])
      await ScannerService.handleRawCapture('raw-data')

      expect(ScannerService.state.value).toBe('scanning')
      expect(ScannerService.lastError.value).toBe('decode failure')
    })
  })

  describe('cancel()', () => {
    it('resolves null and resets all state', async () => {
      registerDecoder(createMockDecoder('test'))

      const promise = ScannerService.scan([{ decoderId: 'test' }])
      expect(ScannerService.state.value).toBe('scanning')

      ScannerService.cancel()

      const result = await promise
      expect(result).toBeNull()
      expect(ScannerService.state.value).toBe('closed')
      expect(ScannerService.activeDecoder.value).toBeNull()
      expect(ScannerService.activeConfig.value).toEqual({})
      expect(ScannerService.lastError.value).toBe('')
    })
  })

  describe('concurrent scan() calls', () => {
    it('second call resolves first with null', async () => {
      registerDecoder(createMockDecoder('test'))

      const config: ScannerConfig[] = [{ decoderId: 'test' }]
      const firstPromise = ScannerService.scan(config)
      const secondPromise = ScannerService.scan(config)

      const firstResult = await firstPromise
      expect(firstResult).toBeNull()

      // Second scan is still active
      expect(ScannerService.state.value).toBe('scanning')

      ScannerService.cancel()
      const secondResult = await secondPromise
      expect(secondResult).toBeNull()
    })
  })

  describe('generation counter (race condition guard)', () => {
    it('discards stale decode result when a new scan starts', async () => {
      let resolveFirstDecode: (value: ScannedIdentity | null) => void
      const firstDecodePromise = new Promise<ScannedIdentity | null>((resolve) => {
        resolveFirstDecode = resolve
      })

      const slowDecoder = createMockDecoder('slow', vi.fn(() => firstDecodePromise))
      registerDecoder(slowDecoder)

      const config: ScannerConfig[] = [{ decoderId: 'slow' }]

      // Start first scan and begin capture
      const firstScanPromise = ScannerService.scan(config)
      const capturePromise = ScannerService.handleRawCapture('data-1')

      // Start a second scan while the first decode is still pending
      const secondScanPromise = ScannerService.scan(config)

      // The first scan promise should resolve with null (superseded)
      const firstResult = await firstScanPromise
      expect(firstResult).toBeNull()

      // Now resolve the slow decoder from the first capture
      const staleResult = createScanResult('slow')
      resolveFirstDecode!(staleResult)
      await capturePromise

      // The service should still be in 'scanning' for the second scan,
      // not 'closed' (because the stale result was discarded)
      expect(ScannerService.state.value).toBe('scanning')

      // Cancel the second scan to clean up
      ScannerService.cancel()
      const secondResult = await secondScanPromise
      expect(secondResult).toBeNull()
    })
  })
})
