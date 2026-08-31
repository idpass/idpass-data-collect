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

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useInjiVerification,
  type InjiFormComponent,
  type InjiFormRoot
} from '../useInjiVerification'
import type { VerifiedVc } from '@/services/injiVcService'

function makeComponent(
  path: string,
  template: string,
  claimPath: string,
  initial: unknown = '',
  label?: string
): InjiFormComponent {
  let value: unknown = initial
  return {
    path,
    component: { label: label ?? path, properties: { injiTemplate: template, injiClaimPath: claimPath } },
    getValue: () => value,
    setValue: (v: unknown) => {
      value = v
    },
    redraw: () => {}
  }
}

function makeRoot(components: InjiFormComponent[]): InjiFormRoot {
  return {
    everyComponent: (cb) => components.forEach(cb),
    getComponent: (path) => components.find((c) => (c.path ?? c.key) === path)
  }
}

function makeVc(digest: string, claims: Record<string, unknown>): VerifiedVc {
  return {
    format: 'jwt-vc',
    issuerDid: 'did:web:issuer.example',
    types: ['VerifiableCredential', 'BirthCertificate'],
    claims,
    issuedAt: 1_700_000_000,
    expiresAt: 1_900_000_000,
    isVerified: true,
    rawDigest: digest,
    raw: `raw-${digest}`
  }
}

const CLAIMS = { credentialSubject: { birthDate: '1990-05-17', nationality: 'PT' } }

describe('useInjiVerification', () => {
  beforeEach(() => useInjiVerification().reset())

  it('fans out a single scan to all same-template fields and dedupes the VC', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const nat = makeComponent('nationality', 'birth-cert-v1', '$.credentialSubject.nationality')
    const root = makeRoot([dob, nat])

    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    const res = session.completeScan(makeVc('dig-1', CLAIMS))

    expect(res.filled.sort()).toEqual(['dob', 'nationality'])
    expect(dob.getValue!()).toBe('1990-05-17')
    expect(nat.getValue!()).toBe('PT')
    // One credential stored despite two verified fields.
    expect(Object.keys(session.scannedVcs)).toEqual(['dig-1'])
    expect(session.getFieldVerification('dob')?.vcDigest).toBe('dig-1')
    expect(session.getFieldVerification('nationality')?.claimValue).toBe('PT')
  })

  it('leaves a field empty when its claim path does not resolve', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const missing = makeComponent('ssn', 'birth-cert-v1', '$.credentialSubject.ssn')
    const root = makeRoot([dob, missing])

    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    const res = session.completeScan(makeVc('dig-1', CLAIMS))

    expect(res.filled).toEqual(['dob'])
    expect(missing.getValue!()).toBe('')
    expect(session.getFieldVerification('ssn')).toBeUndefined()
  })

  it('round-trips serializeForSave / hydrate', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const root = makeRoot([dob])
    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    session.completeScan(makeVc('dig-1', CLAIMS))

    const serialized = session.serializeForSave()
    expect(serialized).not.toBeNull()
    expect(serialized!._injiCredentials['dig-1'].rawVc).toBe('raw-dig-1')
    expect(serialized!._injiVerifications.dob.vcDigest).toBe('dig-1')

    session.reset()
    expect(session.serializeForSave()).toBeNull()

    session.hydrate(serialized as unknown as Record<string, unknown>)
    expect(session.getFieldVerification('dob')?.vcDigest).toBe('dig-1')
    expect(Object.keys(session.scannedVcs)).toEqual(['dig-1'])
  })

  it('serializeForSave returns null when nothing verified', () => {
    expect(useInjiVerification().serializeForSave()).toBeNull()
  })

  it('gates overwrite when a different VC would replace a verified field', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const root = makeRoot([dob])

    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    session.completeScan(makeVc('dig-1', CLAIMS))

    // A different credential for the same field/template.
    const otherClaims = { credentialSubject: { birthDate: '1985-01-01', nationality: 'FR' } }
    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    const gated = session.completeScan(makeVc('dig-2', otherClaims))
    expect(gated.needsOverwriteConfirm).toEqual(['dob'])
    // Nothing mutated yet.
    expect(dob.getValue!()).toBe('1990-05-17')

    const confirmed = session.completeScan(makeVc('dig-2', otherClaims), { overwriteConfirmed: true })
    expect(confirmed.filled).toEqual(['dob'])
    expect(dob.getValue!()).toBe('1985-01-01')
    expect(session.getFieldVerification('dob')?.vcDigest).toBe('dig-2')
  })

  it('protects a manual value in the tapped field (requires confirm, then overwrites)', () => {
    const session = useInjiVerification()
    // Operator already typed a value into the tapped field — NOT from a VC.
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate', '2000-12-31', 'Date of Birth')
    const root = makeRoot([dob])

    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    const gated = session.completeScan(makeVc('dig-1', CLAIMS))

    expect(gated.filled).toEqual([])
    expect(gated.needsOverwriteConfirm).toEqual(['dob'])
    // Manual value untouched until confirmed.
    expect(dob.getValue!()).toBe('2000-12-31')
    // Conflict carries a value diff for the overlay.
    const conflict = gated.conflicts?.find((c) => c.path === 'dob')
    expect(conflict).toBeDefined()
    expect(conflict!.kind).toBe('manual')
    expect(conflict!.oldValue).toBe('2000-12-31')
    expect(conflict!.newValue).toBe('1990-05-17')
    expect(conflict!.label).toBe('Date of Birth')

    const confirmed = session.completeScan(makeVc('dig-1', CLAIMS), { overwriteConfirmed: true })
    expect(confirmed.filled).toEqual(['dob'])
    expect(dob.getValue!()).toBe('1990-05-17')
  })

  it('does not gate when the tapped manual value equals the incoming claim', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate', '1990-05-17')
    const root = makeRoot([dob])
    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    const res = session.completeScan(makeVc('dig-1', CLAIMS))
    expect(res.needsOverwriteConfirm).toBeUndefined()
    expect(res.filled).toEqual(['dob'])
  })

  it('reports fields whose claim path does not resolve as noValue', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const ssn = makeComponent('ssn', 'birth-cert-v1', '$.credentialSubject.ssn')
    const root = makeRoot([dob, ssn])
    void session.requestScan({ fieldPath: 'ssn', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.ssn', formRoot: root })
    const res = session.completeScan(makeVc('dig-1', CLAIMS))
    expect(res.filled).toEqual(['dob'])
    expect(res.noValue).toEqual(['ssn'])
  })

  it('removeVerification clears the value + provenance and drops an orphaned credential', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const root = makeRoot([dob])
    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    session.completeScan(makeVc('dig-1', CLAIMS))
    expect(dob.getValue!()).toBe('1990-05-17')
    expect(Object.keys(session.scannedVcs)).toEqual(['dig-1'])

    session.removeVerification('dob', root)
    expect(session.getFieldVerification('dob')).toBeUndefined()
    expect(dob.getValue!()).toBe('')
    // Credential dropped — no field references it anymore.
    expect(Object.keys(session.scannedVcs)).toEqual([])
  })

  it('removeVerification keeps a shared credential while another field still uses it', () => {
    const session = useInjiVerification()
    const dob = makeComponent('dob', 'birth-cert-v1', '$.credentialSubject.birthDate')
    const nat = makeComponent('nationality', 'birth-cert-v1', '$.credentialSubject.nationality')
    const root = makeRoot([dob, nat])
    void session.requestScan({ fieldPath: 'dob', templateId: 'birth-cert-v1', claimPath: '$.credentialSubject.birthDate', formRoot: root })
    session.completeScan(makeVc('dig-1', CLAIMS))

    session.removeVerification('dob', root)
    expect(session.getFieldVerification('dob')).toBeUndefined()
    // nationality still verified by dig-1 → credential retained.
    expect(session.getFieldVerification('nationality')?.vcDigest).toBe('dig-1')
    expect(Object.keys(session.scannedVcs)).toEqual(['dig-1'])
  })
})
