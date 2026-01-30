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
 * Convert a Uint8Array to a base64 string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Normalize photo data to a Uint8Array.
 * Handles both actual Uint8Array instances and plain objects produced
 * by JSON serialization (which converts Uint8Array to `{ "0": 255, "1": 216, ... }`).
 */
export function normalizePhotoBytes(photo: unknown): Uint8Array | null {
  if (photo instanceof Uint8Array) {
    return photo
  }
  if (typeof photo === 'object' && photo !== null) {
    const photoObj = photo as Record<string, unknown>
    const values = Object.keys(photoObj)
      .filter((k) => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => Number(photoObj[k]))
    if (values.length > 0) {
      return new Uint8Array(values)
    }
  }
  return null
}

/**
 * Build a data URL from photo bytes and a MIME type.
 */
export function photoToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`
}
