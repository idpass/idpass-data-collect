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
import { Claim169Decoder } from '../decoders/Claim169Decoder'
import type { VerifiedIdentity } from '../../services/claim169Service'

// Reuse the same WASM mock pattern from claim169Service tests
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

  const MockDecoder = vi.fn().mockImplementation(() => createMockDecoder())

  return {
    mockVerifyEd25519,
    mockVerifyEcdsaP256,
    mockAllowUnverified,
    mockDecode,
    MockDecoder
  }
})

vi.mock('claim169', () => ({
  Decoder: MockDecoder
}))

const decodedData = {
  claim169: {
    id: 'test-id-123',
    version: '1.0',
    language: 'en',
    fullName: 'John Doe',
    firstName: 'John',
    middleName: 'Michael',
    lastName: 'Doe',
    dateOfBirth: '1990-05-15',
    gender: 1,
    maritalStatus: 2,
    nationality: 'US',
    address: '123 Main St',
    phone: '+1234567890',
    email: 'john@example.com',
    photo: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    photoFormat: 1,
    bestQualityFingers: new Uint8Array([1, 2, 3]),
    guardian: 'Jane Doe',
    secondaryFullName: 'Juan Doe',
    secondaryLanguage: 'es',
    locationCode: 'US-NY',
    legalStatus: 'citizen',
    countryOfIssuance: 'US'
  },
  cwtMeta: {
    issuer: 'test-issuer',
    subject: 'test-subject',
    issuedAt: 1700000000,
    expiresAt: 1800000000,
    notBefore: 1699999000
  }
}

describe('Claim169Decoder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    MockDecoder.mockImplementation(() => createMockDecoder())
  })

  describe('meta', () => {
    it('should have correct id', () => {
      expect(Claim169Decoder.meta.id).toBe('claim169')
    })

    it('should have qr inputType', () => {
      expect(Claim169Decoder.meta.inputType).toBe('qr')
    })

    it('should have a label and description', () => {
      expect(Claim169Decoder.meta.label).toBeTruthy()
      expect(Claim169Decoder.meta.description).toBeTruthy()
    })
  })

  describe('decode', () => {
    it('should map primaryId from identity.id', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result).not.toBeNull()
      expect(result!.primaryId).toBe('test-id-123')
    })

    it('should set decoderId to claim169', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.decoderId).toBe('claim169')
    })

    it('should map core name fields', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.fullName).toBe('John Doe')
      expect(result!.firstName).toBe('John')
      expect(result!.middleName).toBe('Michael')
      expect(result!.lastName).toBe('Doe')
    })

    it('should map dateOfBirth', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.dateOfBirth).toBe('1990-05-15')
    })

    it('should convert gender enum to string via genderToString', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.gender).toBe('male')
    })

    it('should map nationality', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.nationality).toBe('US')
    })

    it('should map address', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.address).toBe('123 Main St')
    })

    it('should map phone', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.phone).toBe('+1234567890')
    })

    it('should map email', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.email).toBe('john@example.com')
    })

    it('should convert photo Uint8Array to data URI', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.photo).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('should create claim169_id identifier from identity.id', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.identifiers).toEqual([
        { type: 'claim169_id', value: 'test-id-123' }
      ])
    })

    it('should map verification metadata', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.verification.isVerified).toBe(false)
      expect(result!.verification.isExpired).toBe(false)
      expect(result!.verification.issuer).toBe('test-issuer')
      expect(result!.verification.issuedAt).toBe(1700000000)
      expect(result!.verification.expiresAt).toBe(1800000000)
    })

    it('should put extra fields (guardian, maritalStatus, etc.) in extra', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.extra.guardian).toBe('Jane Doe')
      expect(result!.extra.maritalStatus).toBe(2)
      expect(result!.extra.secondaryFullName).toBe('Juan Doe')
      expect(result!.extra.secondaryLanguage).toBe('es')
      expect(result!.extra.locationCode).toBe('US-NY')
      expect(result!.extra.legalStatus).toBe('citizen')
      expect(result!.extra.countryOfIssuance).toBe('US')
      expect(result!.extra.version).toBe('1.0')
      expect(result!.extra.language).toBe('en')
      expect(result!.extra.bestQualityFingers).toEqual([1, 2, 3])
    })

    it('should store full VerifiedIdentity in rawData', async () => {
      const result = await Claim169Decoder.decode('test-qr', {})
      const raw = result!.rawData as VerifiedIdentity
      expect(raw.identity.fullName).toBe('John Doe')
      expect(raw.cwt.issuer).toBe('test-issuer')
    })

    it('should handle identity with no photo', async () => {
      mockDecode.mockReturnValue({
        claim169: { ...decodedData.claim169, photo: undefined },
        cwtMeta: decodedData.cwtMeta
      })

      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.photo).toBeUndefined()
    })

    it('should handle identity with no id', async () => {
      mockDecode.mockReturnValue({
        claim169: { ...decodedData.claim169, id: undefined },
        cwtMeta: decodedData.cwtMeta
      })

      const result = await Claim169Decoder.decode('test-qr', {})
      expect(result!.primaryId).toBeUndefined()
      expect(result!.identifiers).toEqual([])
    })

    it('should register trusted issuers from config', async () => {
      await Claim169Decoder.decode('test-qr', {
        trustedIssuers: [
          {
            issuerId: 'config-issuer',
            ed25519Key: btoa(String.fromCharCode(...new Uint8Array(32)))
          }
        ]
      })

      // The decode should have been called (trustedIssuers registered before decode)
      expect(mockDecode).toHaveBeenCalled()
    })
  })
})
