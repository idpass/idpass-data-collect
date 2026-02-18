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

import type { DecoderPlugin } from './types'

const decoders: Map<string, DecoderPlugin> = new Map()

export function registerDecoder(decoder: DecoderPlugin): void {
  decoders.set(decoder.meta.id, decoder)
}

export function getDecoder(id: string): DecoderPlugin | undefined {
  return decoders.get(id)
}

export function getAllDecoders(): DecoderPlugin[] {
  return Array.from(decoders.values())
}

export function clearDecoders(): void {
  decoders.clear()
}
