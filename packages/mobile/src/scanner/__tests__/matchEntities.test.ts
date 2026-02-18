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

import { describe, it, expect } from 'vitest'
import { matchEntities } from '../matchEntities'
import type { ScannedIdentity } from '../types'

function createScanned(overrides: Partial<ScannedIdentity> = {}): ScannedIdentity {
  return {
    decoderId: 'test',
    identifiers: [],
    verification: {
      isVerified: false,
      isExpired: false
    },
    extra: {},
    ...overrides
  }
}

describe('matchEntities', () => {
  const entities = [
    {
      guid: 'entity-1',
      data: { externalId: 'ext-001', name: 'John Doe', dateOfBirth: '1990-05-15' },
      name: 'John Doe'
    },
    {
      guid: 'entity-2',
      data: { externalId: 'ext-002', name: 'Jane Smith', dateOfBirth: '1985-03-20' },
      name: 'Jane Smith'
    },
    {
      guid: 'entity-3',
      data: { externalId: 'ext-003', name: 'Bob Wilson', dateOfBirth: '1992-11-01' },
      name: 'Bob Wilson'
    }
  ]

  describe('exact identifier match', () => {
    it('should match by primaryId against default externalId field', () => {
      const scanned = createScanned({ primaryId: 'ext-001' })
      const results = matchEntities(scanned, entities)

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('entity-1')
      expect(results[0].score).toBe(1.0)
      expect(results[0].matchedField).toBe('externalId')
      expect(results[0].matchedValue).toBe('ext-001')
    })

    it('should match by scanned identifiers against default externalId field', () => {
      const scanned = createScanned({
        identifiers: [{ type: 'claim169_id', value: 'ext-002' }]
      })
      const results = matchEntities(scanned, entities)

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('entity-2')
      expect(results[0].score).toBe(1.0)
    })

    it('should match against a custom identifier field', () => {
      const customEntities = [
        { guid: 'e-1', data: { claim169Id: 'c169-001', name: 'Test' } }
      ]
      const scanned = createScanned({ primaryId: 'c169-001' })
      const results = matchEntities(scanned, customEntities, {
        identifierField: 'claim169Id'
      })

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('e-1')
      expect(results[0].matchedField).toBe('claim169Id')
    })
  })

  describe('name + DOB match', () => {
    it('should match by fullName + dateOfBirth (case-insensitive name)', () => {
      const scanned = createScanned({
        fullName: 'jane smith',
        dateOfBirth: '1985-03-20'
      })
      const results = matchEntities(scanned, entities)

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('entity-2')
      expect(results[0].score).toBe(0.9)
      expect(results[0].matchedField).toBe('name + dateOfBirth')
    })

    it('should match by firstName + lastName when fullName is absent', () => {
      const scanned = createScanned({
        firstName: 'Bob',
        lastName: 'Wilson',
        dateOfBirth: '1992-11-01'
      })
      const results = matchEntities(scanned, entities)

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('entity-3')
      expect(results[0].score).toBe(0.9)
    })

    it('should use custom name and DOB fields', () => {
      const customEntities = [
        { guid: 'e-1', data: { fullName: 'Test Person', dob: '2000-01-01' } }
      ]
      const scanned = createScanned({
        fullName: 'Test Person',
        dateOfBirth: '2000-01-01'
      })
      const results = matchEntities(scanned, customEntities, {
        nameField: 'fullName',
        dateOfBirthField: 'dob'
      })

      expect(results).toHaveLength(1)
      expect(results[0].entity.guid).toBe('e-1')
    })

    it('should not match when name matches but DOB does not', () => {
      const scanned = createScanned({
        fullName: 'John Doe',
        dateOfBirth: '1999-12-31'
      })
      const results = matchEntities(scanned, entities)

      expect(results).toHaveLength(0)
    })
  })

  describe('deduplication', () => {
    it('should keep highest score when entity matches both ID and name+DOB', () => {
      const scanned = createScanned({
        primaryId: 'ext-001',
        fullName: 'John Doe',
        dateOfBirth: '1990-05-15'
      })
      const results = matchEntities(scanned, entities)

      // Should only have one result for entity-1 (deduped), with score 1.0 (ID match wins)
      const entity1Results = results.filter((r) => r.entity.guid === 'entity-1')
      expect(entity1Results).toHaveLength(1)
      expect(entity1Results[0].score).toBe(1.0)
    })
  })

  describe('sorting', () => {
    it('should return results sorted by score descending', () => {
      // Create scenario with both a 1.0 and 0.9 match
      const scanned = createScanned({
        primaryId: 'ext-001',
        fullName: 'Jane Smith',
        dateOfBirth: '1985-03-20'
      })
      const results = matchEntities(scanned, entities)

      expect(results.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
      }
    })
  })

  describe('edge cases', () => {
    it('should return empty array for empty entity list', () => {
      const scanned = createScanned({ primaryId: 'ext-001' })
      const results = matchEntities(scanned, [])

      expect(results).toEqual([])
    })

    it('should return empty array when no matches found', () => {
      const scanned = createScanned({
        primaryId: 'nonexistent',
        fullName: 'Nobody',
        dateOfBirth: '2099-01-01'
      })
      const results = matchEntities(scanned, entities)

      expect(results).toEqual([])
    })

    it('should handle scanned identity with no identifiers and no name/DOB', () => {
      const scanned = createScanned({})
      const results = matchEntities(scanned, entities)

      expect(results).toEqual([])
    })

    it('should handle entities with missing data fields gracefully', () => {
      const sparseEntities = [{ guid: 'sparse-1', data: {} }]
      const scanned = createScanned({ primaryId: 'some-id' })
      const results = matchEntities(scanned, sparseEntities)

      expect(results).toEqual([])
    })
  })
})
