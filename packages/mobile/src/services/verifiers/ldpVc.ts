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
 * Offline JSON-LD (`ldp_vc`) Verifiable Credential verifier — the format the
 * stock MOSIP Inji Wallet renders as a compact, scannable QR (no embedded X.509
 * chain, unlike Certify's `vc+sd-jwt`). Supports the `Ed25519Signature2020`
 * Data-Integrity suite used by the stock Inji `FarmerCredential`.
 *
 * Trust is pinned + offline: the issuer key comes from the tenant `inji` config,
 * never from the network. Canonicalization uses a fail-closed document loader —
 * any `@context` the credential references must be bundled or the verify aborts.
 *
 * Verify-data per the suite: `SHA-256(canonical proofConfig) ||
 * SHA-256(canonical credentialDoc)`, Ed25519-verified against the issuer key.
 */
import * as jsonldMod from 'jsonld'
import { createOfflineDocumentLoader } from './jsonldContexts'
import type { InjiTrustedIssuer } from '@/utils/formIoUtils'
import { VcRejectReason, type VcResult } from '../injiVcService'

// jsonld ships as CJS; pick up the callable under both interop shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonld: any = (jsonldMod as any).default ?? jsonldMod

const SUPPORTED_PROOF_TYPES = new Set(['Ed25519Signature2020'])

// --- base58btc (multibase 'z') decode for the proofValue ---
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Decode(s: string): Uint8Array {
  let n = 0n
  for (const c of s) {
    const v = B58.indexOf(c)
    if (v < 0) throw new Error('invalid base58')
    n = n * 58n + BigInt(v)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n % 256n))
    n /= 256n
  }
  for (const c of s) {
    if (c === '1') bytes.unshift(0)
    else break
  }
  return Uint8Array.from(bytes)
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** Import a raw Ed25519 public key (base64url JWK `x`) as a WebCrypto verify key. */
async function importEd25519(x: string): Promise<CryptoKey | null> {
  try {
    return await globalThis.crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: normalizeB64url(x) },
      { name: 'Ed25519' },
      false,
      ['verify']
    )
  } catch {
    return null
  }
}

function normalizeB64url(s: string): string {
  return s
    .trim()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

type Json = Record<string, unknown>

async function canonize(doc: unknown): Promise<string> {
  return jsonld.canonize(doc, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader: createOfflineDocumentLoader()
  })
}

/**
 * Compute Ed25519Signature2020 verify-data: hash the canonicalized proof options
 * (proof without `proofValue`, sharing the document's `@context`), hash the
 * canonicalized document (without `proof`), concatenate hash(proof)||hash(doc).
 */
async function buildVerifyData(doc: Json, proof: Json): Promise<Uint8Array> {
  const docNoProof: Json = { ...doc }
  delete docNoProof.proof
  const proofConfig: Json = { ...proof, '@context': doc['@context'] }
  delete proofConfig.proofValue

  const [canonProof, canonDoc] = await Promise.all([canonize(proofConfig), canonize(docNoProof)])
  const enc = new TextEncoder()
  const out = new Uint8Array(64)
  out.set(await sha256(enc.encode(canonProof)), 0)
  out.set(await sha256(enc.encode(canonDoc)), 32)
  return out
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function collectTypes(doc: Json): string[] {
  const out = new Set<string>()
  for (const t of asArray(doc.type as string | string[] | undefined)) {
    if (typeof t === 'string') out.add(t)
  }
  return Array.from(out)
}

function resolveIssuerId(doc: Json): string | undefined {
  const iss = doc.issuer
  if (typeof iss === 'string') return iss
  if (iss && typeof iss === 'object' && typeof (iss as Json).id === 'string') {
    return (iss as Json).id as string
  }
  return undefined
}

function epochSeconds(iso: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

/**
 * Verify a JSON-LD VC object (already PixelPass-decoded into an object by the
 * orchestrator). Resolves the issuer offline from the tenant trust registry,
 * canonicalizes with a fail-closed loader, and Ed25519-verifies the proof.
 */
export async function verifyLdp(
  doc: Json,
  injiConfig: { trustedIssuers: InjiTrustedIssuer[] }
): Promise<VcResult> {
  const proof = asArray(doc.proof as Json | Json[] | undefined)[0]
  if (!proof || typeof proof !== 'object') {
    return { ok: false, reason: VcRejectReason.MALFORMED }
  }
  if (typeof proof.type !== 'string' || !SUPPORTED_PROOF_TYPES.has(proof.type)) {
    return { ok: false, reason: VcRejectReason.UNSUPPORTED_FORMAT }
  }
  if (typeof proof.proofValue !== 'string' || !proof.proofValue.startsWith('z')) {
    return { ok: false, reason: VcRejectReason.MALFORMED }
  }

  const issuerId = resolveIssuerId(doc)
  if (!issuerId) {
    return { ok: false, reason: VcRejectReason.MALFORMED }
  }

  // Resolve a trusted issuer: match issuerId, and when verificationMethod is a
  // DID-fragment, require it to belong to the same issuer DID (no cross-issuer key).
  const vm = typeof proof.verificationMethod === 'string' ? proof.verificationMethod : ''
  const issuer = injiConfig.trustedIssuers.find(
    (t) => t.issuerId === issuerId && (!vm || vm === issuerId || vm.startsWith(`${issuerId}#`) || vm.startsWith(issuerId))
  )
  if (!issuer?.publicKey.ed25519) {
    return { ok: false, reason: VcRejectReason.UNKNOWN_ISSUER }
  }

  const key = await importEd25519(issuer.publicKey.ed25519)
  if (!key) {
    return { ok: false, reason: VcRejectReason.UNKNOWN_ISSUER }
  }

  let ok: boolean
  try {
    const data = await buildVerifyData(doc, proof)
    const sig = base58Decode((proof.proofValue as string).slice(1))
    ok = await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, sig as BufferSource, data as BufferSource)
  } catch {
    // Canonicalization failure (un-bundled context) or malformed signature.
    return { ok: false, reason: VcRejectReason.INVALID_SIGNATURE }
  }
  if (!ok) {
    return { ok: false, reason: VcRejectReason.INVALID_SIGNATURE }
  }

  // Validity window (ISO dates, unlike JWT exp/nbf).
  const now = Math.floor(Date.now() / 1000)
  const issuedAt = epochSeconds(doc.issuanceDate) ?? epochSeconds((doc as Json).validFrom)
  const expiresAt = epochSeconds(doc.expirationDate) ?? epochSeconds((doc as Json).validUntil)
  if (issuedAt != null && issuedAt > now + 300) {
    return { ok: false, reason: VcRejectReason.NOT_YET_VALID }
  }
  if (expiresAt != null && expiresAt < now) {
    return { ok: false, reason: VcRejectReason.EXPIRED }
  }

  const raw = JSON.stringify(doc)
  const rawDigest = await sha256Hex(raw)

  return {
    ok: true,
    vc: {
      format: 'ldp_vc',
      issuerDid: issuerId,
      types: collectTypes(doc),
      claims: doc,
      issuedAt,
      expiresAt,
      isVerified: true,
      rawDigest,
      raw
    }
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
