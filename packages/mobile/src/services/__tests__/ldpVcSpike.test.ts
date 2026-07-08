// @vitest-environment node
//
// Phase 2 D1 SPIKE (OP #652): prove offline JSON-LD Ed25519Signature2020
// verification — URDNA2015 canonicalization + SHA-256 + Ed25519 — works with a
// FAIL-CLOSED document loader (zero network) using only bundled @context files.
// This is the gating de-risk for the ldp_vc verifier. Mirrors what the real
// mobile verifier will do (WebCrypto Ed25519 + jsonld.canonize + bundled loader).
/* eslint-disable @typescript-eslint/no-explicit-any -- jsonld ships no usable types; spike uses `any` casts like ldpVc.test.ts */
import { describe, it, expect } from 'vitest'
 
import * as jsonldMod from 'jsonld'
import { createOfflineDocumentLoader } from '../verifiers/jsonldContexts'
const jsonld: any = (jsonldMod as any).default ?? jsonldMod

// Fail-closed loader: only the bundled contexts resolve; anything else throws
// (so any network attempt during canonicalization fails the test loudly).
const documentLoader = createOfflineDocumentLoader()

// --- base58btc (multibase 'z') for Ed25519Signature2020 proofValue ---
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
function b58decode(s: string): Uint8Array {
  let n = 0n
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c))
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

// Ed25519Signature2020 "create verify data": hash(canonical proofConfig) || hash(canonical doc).
async function verifyData(doc: any, proof: any): Promise<Uint8Array> {
  const docNoProof = { ...doc }
  delete docNoProof.proof
  const proofConfig = { ...proof, '@context': doc['@context'] }
  delete proofConfig.proofValue

  const canonDoc: string = await jsonld.canonize(docNoProof, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader,
  })
  const canonProof: string = await jsonld.canonize(proofConfig, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads',
    documentLoader,
  })
  const enc = new TextEncoder()
  const h = new Uint8Array(64)
  h.set(await sha256(enc.encode(canonProof)), 0)
  h.set(await sha256(enc.encode(canonDoc)), 32)
  return h
}

describe('SPIKE: offline ldp_vc Ed25519Signature2020 verification', () => {
  it('canonicalizes + verifies a signed VC with ZERO network', async () => {
    const subtle = globalThis.crypto.subtle
    const kp = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair

    const vc: any = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        { '@vocab': 'https://example.org/vocab#' },
      ],
      type: ['VerifiableCredential'],
      issuer: 'did:example:issuer',
      issuanceDate: '2020-01-01T00:00:00Z',
      credentialSubject: { id: 'did:example:holder', name: 'Gorge Cooper' },
    }
    const proof: any = {
      type: 'Ed25519Signature2020',
      created: '2020-01-01T00:00:00Z',
      verificationMethod: 'did:example:issuer#key-1',
      proofPurpose: 'assertionMethod',
    }

    // Sign
    const data = await verifyData(vc, proof)
    const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, kp.privateKey, data as BufferSource))
    proof.proofValue = 'z' + b58encode(sig)
    const signed = { ...vc, proof }

    // Verify (recompute verify-data offline, decode proofValue, check Ed25519)
    const recomputed = await verifyData(signed, signed.proof)
    const sigBytes = b58decode(signed.proof.proofValue.slice(1))
    const ok = await subtle.verify({ name: 'Ed25519' }, kp.publicKey, sigBytes as BufferSource, recomputed as BufferSource)
    expect(ok).toBe(true)
  })

  it('rejects a tampered claim', async () => {
    const subtle = globalThis.crypto.subtle
    const kp = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const vc: any = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        { '@vocab': 'https://example.org/vocab#' },
      ],
      type: ['VerifiableCredential'],
      issuer: 'did:example:issuer',
      issuanceDate: '2020-01-01T00:00:00Z',
      credentialSubject: { id: 'did:example:holder', name: 'Gorge Cooper' },
    }
    const proof: any = {
      type: 'Ed25519Signature2020',
      created: '2020-01-01T00:00:00Z',
      verificationMethod: 'did:example:issuer#key-1',
      proofPurpose: 'assertionMethod',
    }
    const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, kp.privateKey, (await verifyData(vc, proof)) as BufferSource))
    proof.proofValue = 'z' + b58encode(sig)
    const tampered = { ...vc, credentialSubject: { ...vc.credentialSubject, name: 'Someone Else' }, proof }

    const recomputed = await verifyData(tampered, tampered.proof)
    const ok = await subtle.verify({ name: 'Ed25519' }, kp.publicKey, b58decode(tampered.proof.proofValue.slice(1)) as BufferSource, recomputed as BufferSource)
    expect(ok).toBe(false)
  })

  it('the loader is fail-closed (throws on un-bundled context)', async () => {
    await expect(documentLoader('https://malicious.example/context')).rejects.toThrow('OFFLINE')
  })
})
