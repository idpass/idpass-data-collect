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

/**
 * Normalizes a legacy [id, label] tuple format to just the ID value.
 * This is used when pulling data from OpenSPP to ensure consistent storage format.
 *
 * @param value - The value to normalize (could be `[id, label]`, `{"id": 0, "display_name": ""}`, or already normalized)
 * @returns The normalized ID value, or the original value if it's not a legacy format
 */
export function normalizeLegacyRelationField(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle legacy [id, label] tuple format
  if (Array.isArray(value) && value.length === 2) {
    const [id, label] = value;
    // Validate tuple format: [id (number|string), label (string)]
    if (
      (typeof id === "number" || typeof id === "string") &&
      typeof label === "string"
    ) {
      // Return just the ID, converting to modern format
      return id;
    }
  }

  // Handle modern {"id": 0, "display_name": ""} format
  if (typeof value === "object" && value !== null && "id" in value) {
    const idValue = (value as { id: unknown }).id;
    // Return just the ID
    if (idValue !== null && idValue !== undefined) {
      return idValue;
    }
  }

  // If already a number or string, return as-is
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  // Return original value if it doesn't match any known format
  return value;
}

/**
 * Normalizes all relation fields in a data object that might be in legacy format.
 * Recursively processes the object to find and normalize legacy [id, label] tuples.
 *
 * @param data - The data object to normalize
 * @returns A new object with normalized relation fields
 */
export function normalizeLegacyRelationFields(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      normalized[key] = value;
    } else if (Array.isArray(value) && value.length === 2 && typeof value[0] !== "object") {
      // Check if it's a legacy tuple [id, label]
      const normalizedValue = normalizeLegacyRelationField(value);
      normalized[key] = normalizedValue;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Handle nested objects
      if ("id" in value && ("display_name" in value || "label" in value)) {
        // It's a relation object, normalize it
        normalized[key] = normalizeLegacyRelationField(value);
      } else {
        // It's a regular object, recursively normalize
        normalized[key] = normalizeLegacyRelationFields(value as Record<string, unknown>);
      }
    } else {
      // Primitive value, keep as-is
      normalized[key] = value;
    }
  }

  return normalized;
}

