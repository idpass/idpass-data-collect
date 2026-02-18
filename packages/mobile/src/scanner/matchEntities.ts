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

import type { ScannedIdentity, ScannerMatchConfig, MatchResult } from './types'

interface EntityRecord {
  guid: string
  data: Record<string, unknown>
  name?: string
}

/**
 * Match a scanned identity against a list of entities.
 *
 * Matching logic (runs in order, accumulates all matches):
 * 1. Exact identifier match - for each scanned identifier, check entity data field.
 *    Also check primaryId against the same field. Score: 1.0.
 * 2. Name + DOB match - if scanned has name and DOB, check exact match on entity
 *    name + DOB fields. Case-insensitive name comparison. Score: 0.9.
 *
 * Deduplicates by entity guid (keeps highest score). Returns sorted descending by score.
 */
export function matchEntities(
  scanned: ScannedIdentity,
  entities: EntityRecord[],
  config?: ScannerMatchConfig
): MatchResult[] {
  const identifierField = config?.identifierField ?? 'externalId'
  const nameField = config?.nameField ?? 'name'
  const dateOfBirthField = config?.dateOfBirthField ?? 'dateOfBirth'

  // Accumulate matches keyed by entity guid (keep highest score)
  const matchMap = new Map<string, MatchResult>()

  function addMatch(result: MatchResult) {
    const existing = matchMap.get(result.entity.guid)
    if (!existing || result.score > existing.score) {
      matchMap.set(result.entity.guid, result)
    }
  }

  for (const entity of entities) {
    const rawIdValue = entity.data[identifierField]
    const entityIdValue = typeof rawIdValue === 'string' ? rawIdValue : ''

    // 1. Exact identifier match
    if (entityIdValue) {
      // Check primaryId
      if (scanned.primaryId && entityIdValue === scanned.primaryId) {
        addMatch({
          entity,
          score: 1.0,
          matchedField: identifierField,
          matchedValue: entityIdValue
        })
      }

      // Check each scanned identifier
      for (const identifier of scanned.identifiers) {
        if (entityIdValue === identifier.value) {
          addMatch({
            entity,
            score: 1.0,
            matchedField: identifierField,
            matchedValue: entityIdValue
          })
        }
      }
    }

    // 2. Name + DOB match
    const scannedName =
      scanned.fullName || [scanned.firstName, scanned.lastName].filter(Boolean).join(' ')
    const scannedDob = scanned.dateOfBirth

    if (scannedName && scannedDob) {
      const entityName = String(entity.data[nameField] ?? '')
      const entityDob = String(entity.data[dateOfBirthField] ?? '')

      if (
        entityName &&
        entityDob &&
        entityName.toLowerCase() === scannedName.toLowerCase() &&
        entityDob === scannedDob
      ) {
        addMatch({
          entity,
          score: 0.9,
          matchedField: `${nameField} + ${dateOfBirthField}`,
          matchedValue: `${entityName}, ${entityDob}`
        })
      }
    }
  }

  // Return sorted descending by score
  return Array.from(matchMap.values()).sort((a, b) => b.score - a.score)
}
