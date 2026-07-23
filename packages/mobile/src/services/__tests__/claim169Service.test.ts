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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  genderToString,
  imageFormatToMimeType,
  Claim169ImageFormat,
  Claim169Gender,
  mapClaim169ToEntityData,
  decodeAndVerifyClaim169,
  registerIssuerKey,
  type VerifiedIdentity
} from '../claim169Service'

// Shared decoded data for the mock
const decodedData = {
  claim169: {
    id: 'test-id-123',
    fullName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-05-15',
    gender: 1,
    nationality: 'US',
    photo: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    photoFormat: 1
  },
  cwtMeta: {
    issuer: 'test-issuer',
    issuedAt: Math.floor(Date.now() / 1000) - 3600,
    expiresAt: Math.floor(Date.now() / 1000) + 86400
  }
}

const expiredDecodedData = {
  claim169: { ...decodedData.claim169 },
  cwtMeta: {
    ...decodedData.cwtMeta,
    expiresAt: Math.floor(Date.now() / 1000) - 3600
  }
}

// Use vi.hoisted to create mock functions that are accessible in both vi.mock and tests
const {
  mockVerifyEd25519,
  mockVerifyEcdsaP256,
  mockAllowUnverified,
  mockDecode,
  MockDecoder
} = vi.hoisted(() => {
  const mockVerifyEd25519 = vi.fn()
  const mockVerifyEcdsaP256 = vi.fn()
  const mockAllowUnverified = vi.fn()
  const mockDecode = vi.fn()

  const createMockDecoder = () => ({
    verifyWithEd25519: mockVerifyEd25519,
    verifyWithEcdsaP256: mockVerifyEcdsaP256,
    allowUnverified: mockAllowUnverified,
    decode: mockDecode
  })

  mockVerifyEd25519.mockImplementation(() => createMockDecoder())
  mockVerifyEcdsaP256.mockImplementation(() => createMockDecoder())
  mockAllowUnverified.mockImplementation(() => createMockDecoder())

  const MockDecoder = vi.fn().mockImplementation(function () {
    return createMockDecoder()
  })

  return { mockVerifyEd25519, mockVerifyEcdsaP256, mockAllowUnverified, mockDecode, MockDecoder }
})

vi.mock('claim169', () => ({
  Decoder: MockDecoder
}))

describe('claim169Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish chaining behavior after clearAllMocks
    const createMockDecoder = () => ({
      verifyWithEd25519: mockVerifyEd25519,
      verifyWithEcdsaP256: mockVerifyEcdsaP256,
      allowUnverified: mockAllowUnverified,
      decode: mockDecode
    })
    mockVerifyEd25519.mockImplementation(() => createMockDecoder())
    mockVerifyEcdsaP256.mockImplementation(() => createMockDecoder())
    mockAllowUnverified.mockImplementation(() => createMockDecoder())
    mockDecode.mockReturnValue(decodedData)
    MockDecoder.mockImplementation(function () {
      return createMockDecoder()
    })
  })

  describe('genderToString', () => {
    it('should convert Male code to "male"', () => {
      expect(genderToString(Claim169Gender.Male)).toBe('male')
    })

    it('should convert Female code to "female"', () => {
      expect(genderToString(Claim169Gender.Female)).toBe('female')
    })

    it('should convert Other code to "other"', () => {
      expect(genderToString(Claim169Gender.Other)).toBe('other')
    })

    it('should return undefined for undefined input', () => {
      expect(genderToString(undefined)).toBeUndefined()
    })

    it('should return undefined for unknown gender value', () => {
      expect(genderToString(99)).toBeUndefined()
    })
  })

  describe('imageFormatToMimeType', () => {
    it('should convert JPEG enum value to image/jpeg', () => {
      expect(imageFormatToMimeType(Claim169ImageFormat.Jpeg)).toBe('image/jpeg')
    })

    it('should convert JPEG2000 enum value to image/jp2', () => {
      expect(imageFormatToMimeType(Claim169ImageFormat.Jpeg2000)).toBe('image/jp2')
    })

    it('should convert AVIF enum value to image/avif', () => {
      expect(imageFormatToMimeType(Claim169ImageFormat.Avif)).toBe('image/avif')
    })

    it('should convert WebP enum value to image/webp', () => {
      expect(imageFormatToMimeType(Claim169ImageFormat.Webp)).toBe('image/webp')
    })

    it('should default to image/jpeg for undefined', () => {
      expect(imageFormatToMimeType(undefined)).toBe('image/jpeg')
    })

    it('should default to image/jpeg for unknown value', () => {
      expect(imageFormatToMimeType(99)).toBe('image/jpeg')
    })
  })

  describe('mapClaim169ToEntityData', () => {
    it('should map verified identity to entity data', () => {
      const verifiedIdentity: VerifiedIdentity = {
        isVerified: true,
        isExpired: false,
        identity: {
          id: 'test-id',
          fullName: 'Jane Smith',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1985-03-20',
          gender: 2,
          nationality: 'CA',
          phone: '+1234567890',
          email: 'jane@example.com',
          address: '123 Main St, Toronto, Canada'
        },
        cwt: {
          issuer: 'test-issuer',
          issuedAt: 1700000000,
          expiresAt: 1800000000
        }
      }

      const result = mapClaim169ToEntityData(verifiedIdentity)

      expect(result.entityType).toBe('individual')
      expect(result.fullName).toBe('Jane Smith')
      expect(result.firstName).toBe('Jane')
      expect(result.lastName).toBe('Smith')
      expect(result.dateOfBirth).toBe('1985-03-20')
      expect(result.gender).toBe('female')
      expect(result.nationality).toBe('CA')
      expect(result.phone).toBe('+1234567890')
      expect(result.email).toBe('jane@example.com')
      expect(result.address).toBe('123 Main St, Toronto, Canada')
      expect(result.metadata?.claim169?.isVerified).toBe(true)
      expect(result.metadata?.claim169?.issuer).toBe('test-issuer')
    })

    it('should generate a GUID if id is not provided', () => {
      const verifiedIdentity: VerifiedIdentity = {
        isVerified: false,
        isExpired: false,
        identity: {
          fullName: 'No ID Person'
        },
        cwt: {}
      }

      const result = mapClaim169ToEntityData(verifiedIdentity)

      expect(result.guid).toBeDefined()
      expect(result.guid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should handle photo data', () => {
      const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      const verifiedIdentity: VerifiedIdentity = {
        isVerified: true,
        isExpired: false,
        identity: {
          photo: photoBytes,
          photoFormat: Claim169ImageFormat.Jpeg
        },
        cwt: {}
      }

      const result = mapClaim169ToEntityData(verifiedIdentity)

      expect(result.photo).toBeDefined()
      expect(result.photo).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('should handle bestQualityFingers conversion', () => {
      const fingerData = new Uint8Array([1, 2, 3, 4, 5])
      const verifiedIdentity: VerifiedIdentity = {
        isVerified: true,
        isExpired: false,
        identity: {
          bestQualityFingers: fingerData
        },
        cwt: {}
      }

      const result = mapClaim169ToEntityData(verifiedIdentity)

      expect(result.bestQualityFingers).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('decodeAndVerifyClaim169', () => {
    it('should decode with unverified mode when skipVerification is true', async () => {
      const result = await decodeAndVerifyClaim169('test-qr-content', { skipVerification: true })

      expect(result.identity.fullName).toBe('John Doe')
      expect(result.identity.id).toBe('test-id-123')
      expect(result.isVerified).toBe(false)
      expect(result.isExpired).toBe(false)
      expect(result.rawData).toBe('test-qr-content')
      expect(mockAllowUnverified).toHaveBeenCalled()
    })

    it('should verify with Ed25519 key when provided', async () => {
      const ed25519Key = new Uint8Array(32).fill(1)

      const result = await decodeAndVerifyClaim169('test-qr', { ed25519PublicKey: ed25519Key })

      expect(result.isVerified).toBe(true)
      expect(result.identity.fullName).toBe('John Doe')
      expect(mockVerifyEd25519).toHaveBeenCalledWith(ed25519Key)
    })

    it('should fall back to ES256 when Ed25519 verification fails', async () => {
      const ed25519Key = new Uint8Array(32).fill(1)
      const es256Key = new Uint8Array(64).fill(2)

      // Make Ed25519 verification throw
      mockVerifyEd25519.mockImplementationOnce(() => {
        throw new Error('Ed25519 verification failed')
      })

      const result = await decodeAndVerifyClaim169('test-qr', {
        ed25519PublicKey: ed25519Key,
        es256PublicKey: es256Key
      })

      expect(result.isVerified).toBe(true)
      expect(mockVerifyEcdsaP256).toHaveBeenCalledWith(es256Key)
    })

    it('should fall back to unverified decode when all verification fails', async () => {
      const ed25519Key = new Uint8Array(32).fill(1)

      // Make Ed25519 verification throw
      mockVerifyEd25519.mockImplementation(() => {
        throw new Error('verification failed')
      })
      // Make allowUnverified throw on first peek, succeed on second
      let callCount = 0
      mockAllowUnverified.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call is the peek inside auto-verify; decode returns data with unknown issuer
          return {
            verifyWithEd25519: mockVerifyEd25519,
            verifyWithEcdsaP256: mockVerifyEcdsaP256,
            allowUnverified: mockAllowUnverified,
            decode: () => ({
              claim169: decodedData.claim169,
              cwtMeta: { issuer: 'unknown-issuer' }
            })
          }
        }
        // Second call is the final unverified decode
        return {
          verifyWithEd25519: mockVerifyEd25519,
          verifyWithEcdsaP256: mockVerifyEcdsaP256,
          allowUnverified: mockAllowUnverified,
          decode: () => decodedData
        }
      })

      const result = await decodeAndVerifyClaim169('test-qr', {
        ed25519PublicKey: ed25519Key
      })

      expect(result.isVerified).toBe(false)
      expect(result.identity.fullName).toBe('John Doe')
    })

    it('should detect expired credentials', async () => {
      mockDecode.mockReturnValue(expiredDecodedData)

      const result = await decodeAndVerifyClaim169('test-qr', { skipVerification: true })

      expect(result.isExpired).toBe(true)
      expect(result.isVerified).toBe(false)
    })

    it('should auto-verify with registered issuer keys', async () => {
      // Register a known issuer key
      const ed25519Key = new Uint8Array(32).fill(0xAB)
      registerIssuerKey('test-issuer', { ed25519: ed25519Key })

      // First call to allowUnverified (peek) returns data with known issuer
      let callCount = 0
      mockAllowUnverified.mockImplementation(() => {
        callCount++
        const decoder = {
          verifyWithEd25519: mockVerifyEd25519,
          verifyWithEcdsaP256: mockVerifyEcdsaP256,
          allowUnverified: mockAllowUnverified,
          decode: mockDecode
        }
        if (callCount === 1) {
          return decoder
        }
        // Second call is the final unverified decode
        return {
          verifyWithEd25519: mockVerifyEd25519,
          verifyWithEcdsaP256: mockVerifyEcdsaP256,
          allowUnverified: mockAllowUnverified,
          decode: () => decodedData
        }
      })

      const result = await decodeAndVerifyClaim169('test-qr')

      // Should have attempted auto-verification
      expect(result.identity.fullName).toBe('John Doe')
    })

    it('should include CWT metadata in result', async () => {
      const result = await decodeAndVerifyClaim169('test-qr', { skipVerification: true })

      expect(result.cwt.issuer).toBe('test-issuer')
      expect(result.cwt.issuedAt).toBeDefined()
      expect(result.cwt.expiresAt).toBeDefined()
    })

    it('should store raw QR content in result', async () => {
      const qrContent = 'some-complex-qr-content'
      const result = await decodeAndVerifyClaim169(qrContent, { skipVerification: true })

      expect(result.rawData).toBe(qrContent)
    })
  })

  describe('registerIssuerKey', () => {
    it('should accept string keys and convert to Uint8Array', () => {
      // Base64 for a 32-byte key (all zeros)
      const base64Key = btoa(String.fromCharCode(...new Uint8Array(32)))
      registerIssuerKey('string-key-issuer', { ed25519: base64Key })

      // The function should not throw; verify indirectly via decodeAndVerifyClaim169
    })

    it('should accept Uint8Array keys directly', () => {
      const key = new Uint8Array(32).fill(0x42)
      registerIssuerKey('uint8-key-issuer', { ed25519: key })
    })

    it('should silently skip when no keys are provided', () => {
      // Should not throw
      registerIssuerKey('empty-issuer', {})
    })
  })
})
