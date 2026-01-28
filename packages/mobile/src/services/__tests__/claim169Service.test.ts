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

import { describe, it, expect, vi } from 'vitest'
import {
  genderToString,
  imageFormatToMimeType,
  claim169DateToISO,
  mapClaim169ToEntityData,
  type VerifiedIdentity
} from '../claim169Service'

// Mock the claim169 module
vi.mock('claim169', () => {
  const mockDecoder = {
    verifyWithEd25519: vi.fn().mockReturnThis(),
    verifyWithEcdsaP256: vi.fn().mockReturnThis(),
    allowUnverified: vi.fn().mockReturnThis(),
    decode: vi.fn().mockReturnValue({
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
      },
      verificationStatus: 'skipped'
    })
  }

  return {
    Decoder: vi.fn().mockImplementation(() => mockDecoder)
  }
})

describe('claim169Service', () => {
  describe('genderToString', () => {
    it('should convert Male code to "male"', () => {
      expect(genderToString(1)).toBe('male')
    })

    it('should convert Female code to "female"', () => {
      expect(genderToString(2)).toBe('female')
    })

    it('should convert Other code to "other"', () => {
      expect(genderToString(3)).toBe('other')
    })

    it('should return undefined for undefined input', () => {
      expect(genderToString(undefined)).toBeUndefined()
    })

    it('should return undefined for unknown gender value', () => {
      expect(genderToString(99)).toBeUndefined()
    })
  })

  describe('imageFormatToMimeType', () => {
    it('should convert JPEG code to image/jpeg', () => {
      expect(imageFormatToMimeType(1)).toBe('image/jpeg')
    })

    it('should convert JPEG2000 code to image/jp2', () => {
      expect(imageFormatToMimeType(2)).toBe('image/jp2')
    })

    it('should convert AVIF code to image/avif', () => {
      expect(imageFormatToMimeType(3)).toBe('image/avif')
    })

    it('should convert WebP code to image/webp', () => {
      expect(imageFormatToMimeType(4)).toBe('image/webp')
    })

    it('should default to image/jpeg for undefined', () => {
      expect(imageFormatToMimeType(undefined)).toBe('image/jpeg')
    })
  })

  describe('claim169DateToISO', () => {
    it('should pass through ISO date string', () => {
      expect(claim169DateToISO('1990-05-15')).toBe('1990-05-15')
    })

    it('should return undefined for undefined input', () => {
      expect(claim169DateToISO(undefined)).toBeUndefined()
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
          photoFormat: 1
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
})
