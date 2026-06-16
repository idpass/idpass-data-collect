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
 * Bundled JSON-LD `@context` cache + a fail-closed document loader for offline
 * `ldp_vc` verification. The loader NEVER touches the network: every context a
 * scanned credential references must be statically bundled here, or
 * canonicalization throws. This is the offline trust guarantee — a credential
 * cannot smuggle in remote terms that change how its claims canonicalize.
 *
 * `.json` (not `.jsonld`) so vite/rollup bundle them into the single-file
 * `app.js` natively (no JSON-LD asset plugin needed). Inline `@context` objects
 * embedded in a credential need no fetch and are resolved by jsonld directly.
 */
import credentialsV1 from './credentials-v1.json'
import ed25519Signature2020V1 from './ed25519-2020-v1.json'

/** url → context document. Aliased URLs (http/https, w3id redirects) included. */
export const BUNDLED_CONTEXTS: Record<string, unknown> = {
  'https://www.w3.org/2018/credentials/v1': credentialsV1,
  'https://w3id.org/security/suites/ed25519-2020/v1': ed25519Signature2020V1
}

export interface LoadedContext {
  contextUrl: string | undefined
  document: unknown
  documentUrl: string
}

/**
 * Build a jsonld document loader that resolves ONLY bundled contexts and throws
 * on anything else. Pass to `jsonld.canonize({ documentLoader })`. Throwing (not
 * silently returning empty) keeps verification fail-closed: an unknown context
 * aborts the verify instead of canonicalizing against a partial term set.
 */
export function createOfflineDocumentLoader(
  extra?: Record<string, unknown>
): (url: string) => Promise<LoadedContext> {
  const table = extra ? { ...BUNDLED_CONTEXTS, ...extra } : BUNDLED_CONTEXTS
  return async (url: string): Promise<LoadedContext> => {
    const document = table[url]
    if (!document) {
      throw new Error(`OFFLINE: refusing to fetch un-bundled JSON-LD context ${url}`)
    }
    return { contextUrl: undefined, document, documentUrl: url }
  }
}
