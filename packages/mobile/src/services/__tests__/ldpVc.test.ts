// @vitest-environment node
//
// Phase 2 D1 (OP #652): offline ldp_vc (JSON-LD Ed25519Signature2020) verifier
// tests. Mints a signed VC, wraps it as the wallet would (PixelPass of the
// JSON object), and drives it through the real verify() orchestrator so the
// object-routing path (normalizeScanned → isLdpVc → verifyLdp) is exercised
// end-to-end, with a fail-closed context loader (zero network).
import { describe, it, expect, beforeAll } from 'vitest'
import { exportJWK } from 'jose'
import * as jsonldMod from 'jsonld'
import { generateQRData } from '@injistack/pixelpass'
import { createOfflineDocumentLoader } from '../verifiers/jsonldContexts'
import { verify, extractClaim, matchTemplate, VcRejectReason } from '../injiVcService'
import type { InjiCredentialTemplate, InjiTrustedIssuer } from '@/utils/formIoUtils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonld: any = (jsonldMod as any).default ?? jsonldMod
const subtle = globalThis.crypto.subtle
const loader = createOfflineDocumentLoader()

const ISSUER = 'https://issuer.demo.idpass.org'
const VM = `${ISSUER}#key-1`

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58encode(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out
    else break
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function canonize(doc: any): Promise<string> {
  return jsonld.canonize(doc, { algorithm: 'URDNA2015', format: 'application/n-quads', documentLoader: loader })
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signLdp(vc: any, privateKey: CryptoKey): Promise<any> {
  const proof = {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod: VM,
    proofPurpose: 'assertionMethod',
  }
  const docNoProof = { ...vc }
  const proofConfig = { ...proof, '@context': vc['@context'] }
  const enc = new TextEncoder()
  const data = new Uint8Array(64)
  data.set(await sha256(enc.encode(await canonize(proofConfig))), 0)
  data.set(await sha256(enc.encode(await canonize(docNoProof))), 32)
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, data as BufferSource))
  return { ...vc, proof: { ...proof, proofValue: 'z' + b58encode(sig) } }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseVc(): any {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
      { '@vocab': 'https://example.org/vocab#' },
    ],
    type: ['VerifiableCredential', 'FarmerCredential'],
    issuer: ISSUER,
    issuanceDate: '2024-01-01T00:00:00Z',
    expirationDate: '2999-01-01T00:00:00Z',
    credentialSubject: { id: 'did:example:holder', fullName: 'Gorge Cooper', district: 'Bangalore' },
  }
}

const TEMPLATES: InjiCredentialTemplate[] = [
  { id: 'farmer-ldp-v1', matchTypes: ['FarmerCredential'], expectedFormat: 'ldp_vc', claimLabel: 'Farmer' },
]

// Wallet share-QR encoding: PixelPass(JSON.stringify(credential)).
const walletQr = (vc: unknown) => generateQRData(JSON.stringify(vc), '')

let keyPair: CryptoKeyPair
let edX: string
let trust: { trustedIssuers: InjiTrustedIssuer[] }

beforeAll(async () => {
  keyPair = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  edX = (await exportJWK(keyPair.publicKey)).x as string
  trust = { trustedIssuers: [{ issuerId: ISSUER, publicKey: { ed25519: edX } }] }
})

describe('ldp_vc offline verification', () => {
  it('verifies a signed VC scanned as a wallet PixelPass QR, claims + template resolve', async () => {
    const signed = await signLdp(baseVc(), keyPair.privateKey)
    const res = await verify(walletQr(signed), trust)

    expect(res.ok).toBe(true)
    expect(res.vc?.format).toBe('ldp_vc')
    expect(res.vc?.issuerDid).toBe(ISSUER)
    expect(res.vc?.types).toContain('FarmerCredential')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.fullName')).toBe('Gorge Cooper')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.district')).toBe('Bangalore')
    expect(matchTemplate(res.vc!, TEMPLATES)?.id).toBe('farmer-ldp-v1')
  })

  it('rejects a tampered claim with INVALID_SIGNATURE', async () => {
    const signed = await signLdp(baseVc(), keyPair.privateKey)
    signed.credentialSubject.fullName = 'Someone Else'
    const res = await verify(walletQr(signed), trust)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.INVALID_SIGNATURE)
  })

  it('rejects an unknown issuer', async () => {
    const signed = await signLdp(baseVc(), keyPair.privateKey)
    const other = { trustedIssuers: [{ issuerId: 'https://someone.else', publicKey: { ed25519: edX } }] }
    const res = await verify(walletQr(signed), other)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.UNKNOWN_ISSUER)
  })

  it('rejects a valid signature from a different key (issuer key mismatch)', async () => {
    const signed = await signLdp(baseVc(), keyPair.privateKey)
    const wrongKp = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const wrongX = (await exportJWK(wrongKp.publicKey)).x as string
    const wrongTrust = { trustedIssuers: [{ issuerId: ISSUER, publicKey: { ed25519: wrongX } }] }
    const res = await verify(walletQr(signed), wrongTrust)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.INVALID_SIGNATURE)
  })

  it('rejects an expired credential', async () => {
    const vc = baseVc()
    vc.expirationDate = '2000-01-01T00:00:00Z'
    const signed = await signLdp(vc, keyPair.privateKey)
    const res = await verify(walletQr(signed), trust)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe(VcRejectReason.EXPIRED)
  })

  // Real stock-Inji FarmerCredential shape: the EXACT three @context URLs the
  // MOSIP Certify FarmerCredential template emits (no inline @vocab), all stock
  // claims. Proves the bundled farmer context makes safe-mode canonicalization
  // resolve every term offline — the gating risk for the real-wallet scan.
  it('verifies a stock-shaped FarmerCredential offline with the bundled farmer context', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const farmer: any = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://piyush7034.github.io/my-files/farmer.json',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      type: ['VerifiableCredential', 'FarmerCredential'],
      issuer: ISSUER,
      issuanceDate: '2024-01-01T00:00:00Z',
      expirationDate: '2999-01-01T00:00:00Z',
      credentialSubject: {
        id: 'did:jwk:holder',
        fullName: 'Gorge Cooper',
        mobileNumber: '9876543210',
        dateOfBirth: '1990-05-25',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Whitefield',
        postalCode: '560066',
        landArea: '2.5',
        landOwnershipType: 'Owned',
        primaryCropType: 'Rice',
        secondaryCropType: 'Wheat',
        farmerID: '987654321'
      }
    }
    const signed = await signLdp(farmer, keyPair.privateKey)
    const res = await verify(walletQr(signed), trust)

    expect(res.ok).toBe(true)
    expect(res.vc?.types).toContain('FarmerCredential')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.fullName')).toBe('Gorge Cooper')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.district')).toBe('Bangalore')
    expect(extractClaim(res.vc!.claims, '$.credentialSubject.farmerID')).toBe('987654321')
  })
})
