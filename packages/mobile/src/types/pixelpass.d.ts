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

// Minimal ambient types for @mosip/pixelpass (ships no type definitions).
// PixelPass is MOSIP's QR codec: base45 + CBOR + zlib. The Inji Wallet emits
// share QRs as generateQRData(JSON.stringify(credential)); decode() reverses it.
declare module '@mosip/pixelpass' {
  /** base45 decode → CBOR decode → zlib inflate. Returns the original string. */
  export function decode(data: string): string
  /** zlib deflate → CBOR encode → base45 encode (optional header prefix). */
  export function generateQRData(data: string, header?: string): string
}
