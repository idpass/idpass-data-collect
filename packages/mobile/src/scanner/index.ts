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

export type {
  ScannedIdentifier,
  ScannedIdentity,
  DecoderPluginMeta,
  DecoderPlugin,
  MatchResult,
  ScannerMatchConfig,
  ScannerConfig
} from './types'

export { registerDecoder, getDecoder, getAllDecoders, clearDecoders } from './ScannerRegistry'
export { matchEntities } from './matchEntities'
export { ScannerService, _resetForTesting } from './ScannerService'

import { registerDecoder } from './ScannerRegistry'
import { Claim169Decoder } from './decoders/Claim169Decoder'

/**
 * Register all built-in decoder plugins.
 * Call this at app startup before any scanning occurs.
 */
export function registerDecoders(): void {
  registerDecoder(Claim169Decoder)
}
