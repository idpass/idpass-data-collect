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

import { describe, it, expect, beforeEach } from 'vitest'
import { registerDecoder, getDecoder, getAllDecoders } from '../ScannerRegistry'
import type { DecoderPlugin } from '../types'

function createMockDecoder(id: string): DecoderPlugin {
  return {
    meta: {
      id,
      label: `Mock Decoder ${id}`,
      icon: 'M0 0h24v24H0z',
      description: `A mock decoder with id ${id}`,
      inputType: 'qr'
    },
    decode: async () => null
  }
}

// The registry uses module-level state, so we need to be aware that
// decoders registered in one test persist into the next within the same module import.
// We test additive behavior rather than relying on an empty initial state.

describe('ScannerRegistry', () => {
  const uniquePrefix = `test-${Date.now()}`

  it('should register a decoder and retrieve it by id', () => {
    const id = `${uniquePrefix}-register`
    const decoder = createMockDecoder(id)
    registerDecoder(decoder)

    const retrieved = getDecoder(id)
    expect(retrieved).toBe(decoder)
  })

  it('should return undefined for an unregistered id', () => {
    expect(getDecoder('nonexistent-decoder-id')).toBeUndefined()
  })

  it('should list all registered decoders', () => {
    const id1 = `${uniquePrefix}-list-1`
    const id2 = `${uniquePrefix}-list-2`
    registerDecoder(createMockDecoder(id1))
    registerDecoder(createMockDecoder(id2))

    const all = getAllDecoders()
    const ids = all.map((d) => d.meta.id)
    expect(ids).toContain(id1)
    expect(ids).toContain(id2)
  })

  it('should overwrite a decoder when registering with the same id', () => {
    const id = `${uniquePrefix}-overwrite`
    const decoder1 = createMockDecoder(id)
    const decoder2 = createMockDecoder(id)
    decoder2.meta.label = 'Overwritten'

    registerDecoder(decoder1)
    registerDecoder(decoder2)

    const retrieved = getDecoder(id)
    expect(retrieved?.meta.label).toBe('Overwritten')
  })
})
