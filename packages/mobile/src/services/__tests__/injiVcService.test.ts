/**
 * @vitest-environment node
 *
 * jose's WebCrypto build checks `payload instanceof Uint8Array`; jsdom's
 * TextEncoder yields a foreign-realm Uint8Array, so SignJWT throws under the
 * default jsdom env. This suite is pure crypto (no DOM) — run it in node.
 */
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

import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, exportSPKI, generateKeyPair, base64url, type CryptoKey } from 'jose'
import { generateQRData } from '@mosip/pixelpass'
import {
  detectFormat,
  verify,
  matchTemplate,
  extractClaim,
  normalizeScannedPayload,
  VcRejectReason,
  MAX_VC_BYTES,
  type VerifiedVc
} from '../injiVcService'
import type { InjiTrustedIssuer, InjiCredentialTemplate } from '@/utils/formIoUtils'

const ISSUER = 'did:web:issuer.example'

// jose-signed fixtures generated once. ES256 + Ed25519 issuer keypairs; the
// tenant config carries the exported SPKI PEM public keys. jose is NOT mocked.
let es256Priv: CryptoKey
let edPriv: CryptoKey
let esConfig: { trustedIssuers: InjiTrustedIssuer[] }
let edConfig: { trustedIssuers: InjiTrustedIssuer[] }

async function signEs(payload: Record<string, unknown>, exp = '2h', nbf?: number): Promise<string> {
  let b = new SignJWT(payload).setProtectedHeader({ alg: 'ES256' }).setIssuer(ISSUER).setIssuedAt()
  if (exp) b = b.setExpirationTime(exp)
  if (nbf !== undefined) b = b.setNotBefore(nbf)
  return b.sign(es256Priv)
}

const VC_PAYLOAD = {
  vc: {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'BirthCertificate'],
    credentialSubject: { birthDate: '1990-05-17', name: { first: 'Sofia' } }
  }
}

beforeAll(async () => {
  const es = await generateKeyPair('ES256', { extractable: true })
  const ed = await generateKeyPair('EdDSA', { extractable: true })
  es256Priv = es.privateKey
  edPriv = ed.privateKey
  esConfig = {
    trustedIssuers: [{ issuerId: ISSUER, publicKey: { es256: await exportSPKI(es.publicKey) } }]
  }
  edConfig = {
    trustedIssuers: [{ issuerId: ISSUER, publicKey: { ed25519: await exportSPKI(ed.publicKey) } }]
  }
})

describe('detectFormat', () => {
  it.each([
    ['a.b.c', 'jwt-vc'],
    ['a.b.c~disc1~disc2~', 'sd-jwt'],
    ['a.b.c~', 'sd-jwt'],
    ['not-a-jwt', null],
    ['a.b', null],
    ['', null],
    ['~~', null]
  ])('detects %s as %s', (input, expected) => {
    expect(detectFormat(input as string)).toBe(expected)
  })
})

describe('verify — JWT-VC', () => {
  it('verifies an ES256-signed VC (happy path)', async () => {
    const jwt = await signEs(VC_PAYLOAD)
    const res = await verify(jwt, esConfig)
    expect(res.ok).toBe(true)
    expect(res.vc?.format).toBe('jwt-vc')
    expect(res.vc?.issuerDid).toBe(ISSUER)
    expect(res.vc?.types).toEqual(expect.arrayContaining(['VerifiableCredential', 'BirthCertificate']))
    expect(res.vc?.rawDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.birthDate')).toBe('1990-05-17')
  })

  it('verifies an Ed25519-signed VC', async () => {
    const jwt = await new SignJWT(VC_PAYLOAD)
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(edPriv)
    const res = await verify(jwt, edConfig)
    expect(res.ok).toBe(true)
    expect(res.vc?.issuerDid).toBe(ISSUER)
  })

  it('rejects a tampered signature with INVALID_SIGNATURE', async () => {
    const jwt = await signEs(VC_PAYLOAD)
    const parts = jwt.split('.')
    // Flip the FIRST char of the signature segment — it encodes real bytes, so
    // the tamper is deterministic. (Flipping the LAST char of a 64-byte ES256
    // sig only touches unused base64url padding bits ~1/4 of the time → flaky.)
    const sig = parts[2]
    parts[2] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    const res = await verify(parts.join('.'), esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.INVALID_SIGNATURE)
  })

  it('rejects an unknown issuer', async () => {
    const jwt = await new SignJWT(VC_PAYLOAD)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('did:web:not-trusted')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(es256Priv)
    const res = await verify(jwt, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.UNKNOWN_ISSUER)
  })

  it('rejects an expired VC with EXPIRED', async () => {
    const jwt = await new SignJWT(VC_PAYLOAD)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(ISSUER)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(es256Priv)
    const res = await verify(jwt, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.EXPIRED)
  })

  it('rejects a not-yet-valid VC with NOT_YET_VALID', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const jwt = await signEs(VC_PAYLOAD, '4h', future)
    const res = await verify(jwt, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.NOT_YET_VALID)
  })

  it('rejects an unsupported format', async () => {
    const res = await verify('not.a.jwt.at.all', esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.UNSUPPORTED_FORMAT)
  })

  it('rejects an oversized VC with TOO_LARGE', async () => {
    const big = 'a.b.' + 'x'.repeat(MAX_VC_BYTES + 1)
    const res = await verify(big, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.TOO_LARGE)
  })
})

describe('verify — SD-JWT', () => {
  async function buildSdJwt(disclose: Array<[string, string, unknown]>): Promise<{ token: string; tampered: string }> {
    const enc = (arr: unknown) => base64url.encode(new TextEncoder().encode(JSON.stringify(arr)))
    const disclosures = disclose.map((d) => enc(d))
    const digests = await Promise.all(
      disclosures.map(async (d) => {
        const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))
        return base64url.encode(new Uint8Array(h))
      })
    )
    const payload = {
      vct: 'BirthCertificate',
      type: ['VerifiableCredential', 'BirthCertificate'],
      _sd: digests
    }
    const issuerJwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(es256Priv)
    const token = issuerJwt + '~' + disclosures.join('~') + '~'
    // Tampered: append a forged disclosure whose digest is NOT in _sd.
    const forged = enc(['salt', 'ssn', '000-00-0000'])
    const tampered = issuerJwt + '~' + disclosures.join('~') + '~' + forged + '~'
    return { token, tampered }
  }

  it('merges valid disclosures into the claims object', async () => {
    const { token } = await buildSdJwt([
      ['salt1', 'birthDate', '1990-05-17'],
      ['salt2', 'nationality', 'PT']
    ])
    const res = await verify(token, esConfig)
    expect(res.ok).toBe(true)
    expect(res.vc?.format).toBe('sd-jwt')
    expect(extractClaim(res.vc!.claims, '$.birthDate')).toBe('1990-05-17')
    expect(extractClaim(res.vc!.claims, '$.nationality')).toBe('PT')
  })

  it('drops a tampered disclosure not present in _sd', async () => {
    const { tampered } = await buildSdJwt([['salt1', 'birthDate', '1990-05-17']])
    const res = await verify(tampered, esConfig)
    expect(res.ok).toBe(true)
    // The forged ssn disclosure must not appear in the merged claims.
    expect(extractClaim(res.vc!.claims, '$.ssn')).toBeUndefined()
    expect(extractClaim(res.vc!.claims, '$.birthDate')).toBe('1990-05-17')
  })
})

describe('matchTemplate', () => {
  const baseVc: VerifiedVc = {
    format: 'jwt-vc',
    issuerDid: ISSUER,
    types: ['VerifiableCredential', 'BirthCertificate'],
    claims: {},
    isVerified: true,
    rawDigest: 'x',
    raw: 'x'
  }
  const templates: InjiCredentialTemplate[] = [
    { id: 'birth-cert-v1', matchTypes: ['BirthCertificate'], expectedFormat: 'jwt-vc' },
    { id: 'passport-v1', matchTypes: ['Passport'], expectedFormat: 'jwt-vc' }
  ]

  it('matches a template whose matchTypes are a subset of the VC types', () => {
    expect(matchTemplate(baseVc, templates)?.id).toBe('birth-cert-v1')
  })

  it('returns null when no template type matches', () => {
    expect(matchTemplate({ ...baseVc, types: ['VerifiableCredential'] }, templates)).toBeNull()
  })

  it('honours an explicit templateId', () => {
    expect(matchTemplate(baseVc, templates, 'passport-v1')).toBeNull()
    expect(matchTemplate(baseVc, templates, 'birth-cert-v1')?.id).toBe('birth-cert-v1')
  })

  it('enforces allowedIssuers scope', () => {
    const scoped: InjiCredentialTemplate[] = [
      { id: 'birth-cert-v1', matchTypes: ['BirthCertificate'], expectedFormat: 'jwt-vc', allowedIssuers: ['did:web:other'] }
    ]
    expect(matchTemplate(baseVc, scoped)).toBeNull()
  })
})

describe('extractClaim', () => {
  const obj = { credentialSubject: { name: 'Sofia', kids: [{ age: 4 }, { age: 7 }] } }
  it.each([
    ['$.credentialSubject.name', 'Sofia'],
    ['$.credentialSubject.kids[1].age', 7],
    ['credentialSubject.name', 'Sofia'],
    ['$.credentialSubject.missing', undefined],
    ['$.credentialSubject.kids[9].age', undefined]
  ])('resolves %s', (path, expected) => {
    expect(extractClaim(obj, path as string)).toBe(expected)
  })
})

describe('Certify-shaped SD-JWT (real issuer wire format)', () => {
  // Reproduces exactly what MOSIP Inji Certify emits for a vc+sd-jwt credential
  // (verified from certify-service SDJWT.java + VelocityTemplatingEngineImpl):
  //  - the vcTemplate is filled, so `credentialSubject` stays NESTED
  //  - `vct` is injected at the payload top level
  //  - selectively-disclosed claims become an `_sd` digest array INSIDE
  //    credentialSubject (Authlete `com.authlete.sd` / IETF SD-JWT), with the
  //    plain claims left in place
  // This pins the structure our verifier must parse, and proves the correct
  // field path is `$.credentialSubject.<claim>` (NOT a flat top-level claim).
  async function buildCertifySdJwt(): Promise<string> {
    const enc = (arr: unknown) => base64url.encode(new TextEncoder().encode(JSON.stringify(arr)))
    const digest = async (d: string) =>
      base64url.encode(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))))

    // Disclosed (selectively-disclosable) claims — Authlete disclosure = [salt, name, value].
    const dFullName = enc(['c2FsdEZO', 'fullName', 'Gorge Cooper'])
    const dDob = enc(['c2FsdERP', 'dateOfBirth', '25-05-1990'])

    const payload = {
      vct: 'FarmerSdJwt',
      credentialSubject: {
        id: 'did:jwk:holder',
        // plain (always-disclosed) claims stay in place
        gender: 'Male',
        district: 'Bangalore',
        // disclosed claims are replaced by their digests in an _sd array
        _sd: [await digest(dFullName), await digest(dDob)]
      }
    }
    const issuerJwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'vc+sd-jwt' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(edPriv)
    return `${issuerJwt}~${dFullName}~${dDob}~`
  }

  it('verifies, merges nested _sd, and resolves credentialSubject claim paths', async () => {
    const token = await buildCertifySdJwt()
    const res = await verify(token, edConfig)

    expect(res.ok).toBe(true)
    expect(res.vc?.format).toBe('sd-jwt')
    // vct injected at top level → surfaced as a type
    expect(res.vc?.types).toContain('FarmerSdJwt')
    // plain claim (never in _sd) resolves
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.gender')).toBe('Male')
    // disclosed claims merged back UNDER credentialSubject (nested _sd handled)
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.fullName')).toBe('Gorge Cooper')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.dateOfBirth')).toBe('25-05-1990')
  })

  it('matches a tenant template by the injected vct', async () => {
    const token = await buildCertifySdJwt()
    const res = await verify(token, edConfig)
    const templates: InjiCredentialTemplate[] = [
      { id: 'farmer-sdjwt-v1', matchTypes: ['FarmerSdJwt'], expectedFormat: 'sd-jwt' }
    ]
    expect(matchTemplate(res.vc!, templates)?.id).toBe('farmer-sdjwt-v1')
  })
})

describe('normalizeScannedPayload / PixelPass (Inji Wallet QR)', () => {
  // Reproduce the wallet's share-QR encoding: PixelPass(JSON.stringify(credential)).
  // For vc+sd-jwt the credential is the compact SD-JWT string.
  const walletQrFor = (compact: string) => generateQRData(JSON.stringify(compact), '')

  async function buildSdJwt(disclose: Array<[string, string, unknown]>): Promise<string> {
    const enc = (arr: unknown) => base64url.encode(new TextEncoder().encode(JSON.stringify(arr)))
    const disclosures = disclose.map((d) => enc(d))
    const digests = await Promise.all(
      disclosures.map(async (d) => {
        const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(d))
        return base64url.encode(new Uint8Array(h))
      })
    )
    const issuerJwt = await new SignJWT({ vct: 'BirthCertificate', type: ['VerifiableCredential', 'BirthCertificate'], _sd: digests })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(es256Priv)
    return issuerJwt + '~' + disclosures.join('~') + '~'
  }

  it('leaves an already-compact payload untouched', () => {
    expect(normalizeScannedPayload('aaa.bbb.ccc')).toBe('aaa.bbb.ccc')
    expect(normalizeScannedPayload('aaa.bbb.ccc~d1~d2~')).toBe('aaa.bbb.ccc~d1~d2~')
  })

  it('recovers a compact SD-JWT from a wallet PixelPass QR', async () => {
    const compact = await buildSdJwt([['salt1', 'birthDate', '1990-05-17']])
    const qr = walletQrFor(compact)
    expect(qr).not.toContain('~') // it's base45-encoded, not the raw compact string
    expect(normalizeScannedPayload(qr)).toBe(compact)
  })

  it('verify() succeeds on a wallet PixelPass QR with the same claims as the raw compact', async () => {
    const compact = await buildSdJwt([
      ['salt1', 'birthDate', '1990-05-17'],
      ['salt2', 'nationality', 'PT']
    ])
    const qr = walletQrFor(compact)

    const fromRaw = await verify(compact, esConfig)
    const fromQr = await verify(qr, esConfig)

    expect(fromRaw.ok).toBe(true)
    expect(fromQr.ok).toBe(true)
    expect(fromQr.vc?.rawDigest).toBe(fromRaw.vc?.rawDigest)
    expect(extractClaim(fromQr.vc!.claims, '$.birthDate')).toBe('1990-05-17')
    expect(extractClaim(fromQr.vc!.claims, '$.nationality')).toBe('PT')
  })

  it('routes a PixelPass-wrapped JSON-LD object to the ldp_vc verifier (rejects when proof is incomplete)', async () => {
    // Now SUPPORTED (Phase 2): an @context+proof object is routed to verifyLdp.
    // This one has no proofValue → MALFORMED, proving it reached the ldp path
    // rather than being dropped as UNSUPPORTED_FORMAT.
    const jsonLd = { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential'], issuer: 'did:example:x', proof: { type: 'Ed25519Signature2020' } }
    const qr = generateQRData(JSON.stringify(jsonLd), '')
    const res = await verify(qr, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.MALFORMED)
  })

  it('rejects a PixelPass object without @context+proof as unsupported', async () => {
    const obj = { type: ['VerifiableCredential'], hello: 'world' }
    const qr = generateQRData(JSON.stringify(obj), '')
    const res = await verify(qr, esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.UNSUPPORTED_FORMAT)
  })

  it('rejects non-PixelPass garbage cleanly', async () => {
    const res = await verify('not pixelpass, not a jwt', esConfig)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.UNSUPPORTED_FORMAT)
  })
})
