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
 * Inji wallet Verifiable Credential verification service.
 *
 * Pure functions — no module-level mutable registry. The caller passes the
 * tenant `inji` trust config in. Phase 1 supports JWT-VC and SD-JWT only,
 * verified offline with `jose` (Web Crypto). JSON-LD VC is deferred.
 *
 * Issuer public keys are resolved purely from the tenant config (no network).
 * A key string is interpreted as a PEM SPKI block when it contains a
 * `-----BEGIN PUBLIC KEY-----` header, otherwise as base64url-encoded raw key
 * material (Ed25519: 32-byte public key; ES256: 65-byte uncompressed P-256
 * point `0x04 || X || Y`).
 */

import {
  base64url,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  importSPKI,
  jwtVerify,
  type CryptoKey,
  type JWK
} from 'jose'
import { decode as pixelPassDecode } from '@mosip/pixelpass'
import type { InjiCredentialTemplate, InjiTrustedIssuer } from '@/utils/formIoUtils'
import { verifyLdp } from './verifiers/ldpVc'

export type VcFormat = 'jwt-vc' | 'sd-jwt' | 'ldp_vc'

export enum VcRejectReason {
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  MALFORMED = 'MALFORMED',
  TOO_LARGE = 'TOO_LARGE',
  UNKNOWN_ISSUER = 'UNKNOWN_ISSUER',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  EXPIRED = 'EXPIRED',
  NOT_YET_VALID = 'NOT_YET_VALID',
  WRONG_TEMPLATE = 'WRONG_TEMPLATE',
  CLAIM_NOT_FOUND = 'CLAIM_NOT_FOUND'
}

export interface VerifiedVc {
  format: VcFormat
  issuerDid: string
  types: string[]
  /** Claims object that `extractClaim` resolves against (root `$`). */
  claims: Record<string, unknown>
  issuedAt?: number
  expiresAt?: number
  isVerified: boolean
  rawDigest: string
  raw: string
}

export interface VcResult {
  ok: boolean
  reason?: VcRejectReason
  vc?: VerifiedVc
}

/**
 * 64 KB ceiling on the raw VC string. Credentials with embedded photo /
 * biometric bytes blow past this; they bloat synced events and are rejected
 * with a user-facing error. Kept well above a text-only VC (~2–4 KB).
 */
export const MAX_VC_BYTES = 64 * 1024

/**
 * Detect the VC serialization. SD-JWT uses `~` as the disclosure separator
 * (`<issuer-jwt>~<disclosure>~…~[<kb-jwt>]`); a bare 3-part JWT is JWT-VC.
 */
export function detectFormat(raw: string): VcFormat | null {
  const s = raw.trim()
  if (!s) return null
  if (s.includes('~')) {
    const issuerJwt = s.split('~')[0]
    return isCompactJws(issuerJwt) ? 'sd-jwt' : null
  }
  return isCompactJws(s) ? 'jwt-vc' : null
}

function isCompactJws(s: string): boolean {
  const parts = s.split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0)
}

/**
 * Recover a compact VC string from a scanned payload.
 *
 * The MOSIP Inji Wallet emits its share QR as
 * `PixelPass(JSON.stringify(credential))` — for a `vc+sd-jwt` credential the
 * inner value is the compact SD-JWT string, JSON-quoted, then base45/CBOR/zlib
 * encoded. This reverses that so {@link verify} sees the same compact string a
 * pasted fixture would produce.
 *
 * Best-effort and side-effect-free:
 * - Already-compact input (a fixture, or a paste) is returned untouched — no
 *   PixelPass attempted.
 * - A PixelPass blob that decodes+`JSON.parse`s to a string is unwrapped.
 * - Anything else (JSON-LD / mDoc object, or non-PixelPass garbage) is returned
 *   unchanged so `verify` rejects it cleanly with `UNSUPPORTED_FORMAT`.
 *
 * Never throws.
 */
export function normalizeScannedPayload(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  // Already a compact JWT/SD-JWT (fixture or paste) — do not PixelPass-decode.
  if (detectFormat(s)) return s
  try {
    const decoded = pixelPassDecode(s)
    // Wallet wrapped the compact string with JSON.stringify → parse unwraps it.
    const parsed = JSON.parse(decoded)
    if (typeof parsed === 'string') return parsed
    // Object (JSON-LD / mDoc) — surfaced via normalizeScanned, not this string API.
    return s
  } catch {
    return s
  }
}

/**
 * Structured form of {@link normalizeScannedPayload} used by {@link verify}.
 * Recovers the scanned payload and reports its shape so the orchestrator can
 * route JSON-LD credentials (objects) to the `ldp_vc` verifier instead of
 * dropping them. A compact JWS string stays a string; a PixelPass blob that
 * decodes to a JSON string is unwrapped to that string; one that decodes to a
 * JSON object (JSON-LD / mDoc) surfaces as an object. Never throws.
 */
export function normalizeScanned(raw: string): { kind: 'string' | 'object'; value: string | Record<string, unknown> } {
  const s = raw.trim()
  if (!s) return { kind: 'string', value: s }
  if (detectFormat(s)) return { kind: 'string', value: s }
  try {
    const parsed = JSON.parse(pixelPassDecode(s))
    if (typeof parsed === 'string') return { kind: 'string', value: parsed }
    if (parsed && typeof parsed === 'object') return { kind: 'object', value: parsed as Record<string, unknown> }
  } catch {
    // not PixelPass — fall through
  }
  return { kind: 'string', value: s }
}

/** A decoded object is `ldp_vc` when it carries a JSON-LD context and a proof. */
function isLdpVc(obj: Record<string, unknown>): boolean {
  return '@context' in obj && 'proof' in obj
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64url.encode(new Uint8Array(digest))
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build a verification key from a tenant-config public key string.
 * Tries ES256 first when present, then Ed25519. Returns null when neither
 * key material can be imported.
 */
async function importIssuerKey(
  issuer: InjiTrustedIssuer,
  alg: string | undefined
): Promise<CryptoKey | Uint8Array | null> {
  const { es256, ed25519 } = issuer.publicKey
  // Prefer the key matching the token's declared algorithm.
  const preferEd = alg === 'EdDSA' || alg === 'Ed25519'
  const order: Array<['ES256' | 'EdDSA', string | undefined]> = preferEd
    ? [['EdDSA', ed25519], ['ES256', es256]]
    : [['ES256', es256], ['EdDSA', ed25519]]

  for (const [keyAlg, material] of order) {
    if (!material) continue
    try {
      if (material.includes('BEGIN PUBLIC KEY')) {
        return await importSPKI(material, keyAlg)
      }
      const jwk = rawKeyToJwk(keyAlg, material)
      if (jwk) return await importJWK(jwk, keyAlg)
    } catch {
      // try the next key material
    }
  }
  return null
}

function rawKeyToJwk(alg: 'ES256' | 'EdDSA', material: string): JWK | null {
  try {
    if (alg === 'EdDSA') {
      return { kty: 'OKP', crv: 'Ed25519', x: normalizeB64url(material) }
    }
    // ES256: expect a 65-byte uncompressed P-256 point (0x04 || X || Y).
    const bytes = decodeMaybeBase64(material)
    if (bytes.length === 65 && bytes[0] === 0x04) {
      const x = bytes.slice(1, 33)
      const y = bytes.slice(33, 65)
      return { kty: 'EC', crv: 'P-256', x: base64url.encode(x), y: base64url.encode(y) }
    }
    return null
  } catch {
    return null
  }
}

function normalizeB64url(s: string): string {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeMaybeBase64(s: string): Uint8Array {
  try {
    return base64url.decode(normalizeB64url(s))
  } catch {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  }
}

/**
 * Verify a VC string against the tenant trust registry. Resolves the issuer
 * offline, verifies the JWS signature, validates `exp`/`nbf`, and (for
 * SD-JWT) merges valid disclosures. Returns a flat `VcResult` — `ok` plus an
 * optional reason and the normalized credential.
 */
export async function verify(raw: string, injiConfig: { trustedIssuers: InjiTrustedIssuer[] }): Promise<VcResult> {
  // Recover the scanned payload (compact string, or a decoded JSON-LD object).
  const scanned = normalizeScanned(raw)

  if (scanned.kind === 'object') {
    const obj = scanned.value as Record<string, unknown>
    if (byteLength(JSON.stringify(obj)) > MAX_VC_BYTES) {
      return { ok: false, reason: VcRejectReason.TOO_LARGE }
    }
    if (!isLdpVc(obj)) {
      return { ok: false, reason: VcRejectReason.UNSUPPORTED_FORMAT }
    }
    return verifyLdp(obj, injiConfig)
  }

  const s = scanned.value as string
  if (byteLength(s) > MAX_VC_BYTES) {
    return { ok: false, reason: VcRejectReason.TOO_LARGE }
  }

  const format = detectFormat(s)
  if (!format) {
    return { ok: false, reason: VcRejectReason.UNSUPPORTED_FORMAT }
  }

  return verifyJws(s, format, injiConfig)
}

/**
 * Verify a compact JWS-based VC (JWT-VC or SD-JWT). Resolves the issuer offline,
 * verifies the signature, validates `exp`/`nbf`, and (for SD-JWT) merges valid
 * disclosures.
 */
async function verifyJws(
  s: string,
  format: VcFormat,
  injiConfig: { trustedIssuers: InjiTrustedIssuer[] }
): Promise<VcResult> {
  const issuerJwt = format === 'sd-jwt' ? s.split('~')[0] : s

  let header: { alg?: string; kid?: string }
  let peek: Record<string, unknown>
  try {
    header = decodeProtectedHeader(issuerJwt) as { alg?: string; kid?: string }
    peek = decodeJwt(issuerJwt) as Record<string, unknown>
  } catch {
    return { ok: false, reason: VcRejectReason.MALFORMED }
  }

  const iss = typeof peek.iss === 'string' ? peek.iss : undefined
  if (!iss) {
    return { ok: false, reason: VcRejectReason.MALFORMED }
  }

  // Resolve a trusted issuer: match issuerId, and kid when both sides declare one.
  const issuer = injiConfig.trustedIssuers.find(
    (t) => t.issuerId === iss && (!t.kid || !header.kid || t.kid === header.kid)
  )
  if (!issuer) {
    return { ok: false, reason: VcRejectReason.UNKNOWN_ISSUER }
  }

  const key = await importIssuerKey(issuer, header.alg)
  if (!key) {
    return { ok: false, reason: VcRejectReason.UNKNOWN_ISSUER }
  }

  let payload: Record<string, unknown>
  try {
    const verified = await jwtVerify(issuerJwt, key)
    payload = verified.payload as Record<string, unknown>
  } catch (err) {
    return { ok: false, reason: mapVerifyError(err) }
  }

  // Reconstruct the claims object. For SD-JWT, merge valid disclosures.
  let claims: Record<string, unknown>
  if (format === 'sd-jwt') {
    claims = await mergeSdJwtDisclosures(payload, s)
  } else {
    const vc = payload.vc
    claims = vc && typeof vc === 'object' ? (vc as Record<string, unknown>) : payload
  }

  const rawDigest = await sha256Hex(s)

  return {
    ok: true,
    vc: {
      format,
      issuerDid: iss,
      types: collectTypes(payload, claims),
      claims,
      issuedAt: numClaim(payload.iat) ?? numClaim(payload.nbf),
      expiresAt: numClaim(payload.exp),
      isVerified: true,
      rawDigest,
      raw: s
    }
  }
}

function numClaim(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

function mapVerifyError(err: unknown): VcRejectReason {
  const code = (err as { code?: string })?.code
  if (code === 'ERR_JWT_EXPIRED') return VcRejectReason.EXPIRED
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const claim = (err as { claim?: string }).claim
    if (claim === 'nbf') return VcRejectReason.NOT_YET_VALID
  }
  return VcRejectReason.INVALID_SIGNATURE
}

function collectTypes(payload: Record<string, unknown>, claims: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const push = (v: unknown) => {
    if (typeof v === 'string') out.add(v)
    else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.add(x))
  }
  const vc = payload.vc as Record<string, unknown> | undefined
  push(vc?.type)
  push(payload.type)
  push(claims.type)
  push(payload.vct) // SD-JWT VC type
  return Array.from(out)
}

/**
 * Minimal SD-JWT disclosure merge. Each disclosure is base64url of
 * `[salt, claimName, claimValue]`. A disclosure is accepted only when its
 * SHA-256 (base64url) digest appears in an `_sd` array of the payload (or a
 * nested object); tampered/forged disclosures are silently dropped.
 */
async function mergeSdJwtDisclosures(
  payload: Record<string, unknown>,
  raw: string
): Promise<Record<string, unknown>> {
  const segments = raw.split('~').slice(1).filter((seg) => seg.length > 0)
  // Last segment may be a key-binding JWT (3 dot-parts); skip it as a disclosure.
  const disclosures = segments.filter((seg) => !isCompactJws(seg))

  // Collect all valid disclosed (name, value) pairs keyed by their digest.
  const byDigest = new Map<string, { name: string; value: unknown }>()
  for (const d of disclosures) {
    try {
      const json = new TextDecoder().decode(base64url.decode(d))
      const arr = JSON.parse(json)
      if (Array.isArray(arr) && arr.length >= 3 && typeof arr[1] === 'string') {
        const digest = await sha256Base64url(d)
        byDigest.set(digest, { name: arr[1], value: arr[2] })
      }
    } catch {
      // skip malformed disclosure
    }
  }

  // Recursively resolve `_sd` digest arrays against the disclosure map.
  const resolve = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(resolve)
    if (node && typeof node === 'object') {
      const obj = { ...(node as Record<string, unknown>) }
      const sd = obj._sd
      delete obj._sd
      if (Array.isArray(sd)) {
        for (const digest of sd) {
          const hit = typeof digest === 'string' ? byDigest.get(digest) : undefined
          if (hit) obj[hit.name] = resolve(hit.value)
        }
      }
      for (const k of Object.keys(obj)) {
        obj[k] = resolve(obj[k])
      }
      return obj
    }
    return node
  }

  const resolved = resolve(payload) as Record<string, unknown>
  // SD-JWT VC carries claims flat in the payload; prefer a `vc` wrapper if present.
  const vc = resolved.vc
  return vc && typeof vc === 'object' ? (vc as Record<string, unknown>) : resolved
}

/**
 * Choose the credential template a verified VC satisfies. When `templateId`
 * is given, only that template is considered. A template matches when every
 * entry in its `matchTypes` is present in the VC `type` set and (when
 * `allowedIssuers` is set) the issuer is allowlisted.
 */
export function matchTemplate(
  vc: VerifiedVc,
  templates: InjiCredentialTemplate[],
  templateId?: string
): InjiCredentialTemplate | null {
  const candidates = templateId ? templates.filter((t) => t.id === templateId) : templates
  const typeSet = new Set(vc.types)
  for (const t of candidates) {
    const typesOk = t.matchTypes.length === 0 || t.matchTypes.every((mt) => typeSet.has(mt))
    const issuerOk = !t.allowedIssuers?.length || t.allowedIssuers.includes(vc.issuerDid)
    if (typesOk && issuerOk) return t
  }
  return null
}

/**
 * Resolve a minimal JSONPath (`$.a.b[0].c`) against the VC claims object.
 * Supports dot member access and `[n]` array indexing only. Returns
 * `undefined` when any segment does not resolve.
 */
export function extractClaim(claims: Record<string, unknown>, jsonPath: string): unknown {
  if (!jsonPath) return undefined
  let path = jsonPath.trim()
  if (path.startsWith('$')) path = path.slice(1)
  if (path.startsWith('.')) path = path.slice(1)
  if (!path) return claims

  const tokens: Array<string | number> = []
  for (const seg of path.split('.')) {
    const m = seg.match(/^([^[\]]*)((\[\d+\])*)$/)
    if (!m) return undefined
    if (m[1]) tokens.push(m[1])
    const idx = m[2]
    if (idx) {
      for (const num of idx.matchAll(/\[(\d+)\]/g)) {
        tokens.push(Number(num[1]))
      }
    }
  }

  let cur: unknown = claims
  for (const tok of tokens) {
    if (cur == null) return undefined
    if (typeof tok === 'number') {
      if (!Array.isArray(cur)) return undefined
      cur = cur[tok]
    } else {
      if (typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[tok]
    }
  }
  return cur
}

/** SHA-256 hex digest of a raw VC string — the dedupe/provenance key. */
export async function digestVc(raw: string): Promise<string> {
  return sha256Hex(raw.trim())
}
