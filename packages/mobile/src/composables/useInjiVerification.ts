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
 * Inji per-form verification session.
 *
 * A module-level singleton (NOT a per-call composable) because Form.io field
 * instances live outside Vue's component tree and must reach the same session
 * state the overlay drives — same shape as {@link Claim169ScannerService}.
 *
 * Responsibilities:
 * - Drive the `InjiVerifyOverlay` (reactive `isOpen` + scan target + promise).
 * - Hold the form-session provenance: scanned VCs (deduped by digest) and the
 *   per-field verification entries that fan out from a single scan.
 * - Serialize/hydrate that provenance to/from `entity.data` (`_inji*` keys).
 */

import { reactive, ref } from 'vue'
import { extractClaim, type VerifiedVc } from '@/services/injiVcService'

/** Form.io live component, narrowed to the bits the fan-out uses. */
export interface InjiFormComponent {
  path?: string
  key?: string
  component?: { label?: string; properties?: Record<string, string> }
  getValue?: () => unknown
  setValue?: (value: unknown) => void
  redraw?: () => void
}

export interface InjiFormRoot {
  everyComponent: (cb: (component: InjiFormComponent) => void) => void
  getComponent?: (path: string) => InjiFormComponent | undefined
}

export interface InjiScanTarget {
  fieldPath: string
  templateId: string
  claimPath: string
  /** Optional label surfaced in the overlay header. */
  label?: string
  formRoot: InjiFormRoot
}

/** Persisted credential entry (one per unique VC digest). */
export interface InjiCredentialRecord {
  rawVc: string
  format: VerifiedVc['format']
  issuerDid: string
  issuedAt?: number
  expiresAt?: number
}

/** Persisted per-field verification entry. */
export interface InjiVerificationRecord {
  vcDigest: string
  template: string
  claimPath: string
  claimValue?: string | number | boolean
  verifiedAt: string
}

export interface InjiSerializedProvenance {
  _injiCredentials: Record<string, InjiCredentialRecord>
  _injiVerifications: Record<string, InjiVerificationRecord>
}

/** A field whose existing value (manual or VC-filled) would be replaced. */
export interface InjiOverwriteConflict {
  path: string
  label?: string
  claimPath: string
  oldValue: unknown
  newValue: unknown
  /** `vc` = previously verified by a different credential; `manual` = operator-typed. */
  kind: 'vc' | 'manual'
}

export interface CompleteScanResult {
  /** Fields whose value was filled (paths). */
  filled: string[]
  /** Paths needing overwrite confirmation (back-compat flat list). */
  needsOverwriteConfirm?: string[]
  /** Rich per-field diff for the overwrite-confirm UI. */
  conflicts?: InjiOverwriteConflict[]
  /** Same-template fields whose claim path resolved nothing (right VC, no value). */
  noValue?: string[]
}

// ── Overlay-facing reactive state ───────────────────────────────────────────
const isOpen = ref(false)
const currentTarget = ref<InjiScanTarget | null>(null)
const resolveScan = ref<((vc: VerifiedVc | null) => void) | null>(null)

// ── Session provenance (survives across fields within one form session) ──────
const scannedVcs = reactive<Record<string, InjiCredentialRecord>>({})
const verifications = reactive<Record<string, InjiVerificationRecord>>({})

function fieldPathOf(c: InjiFormComponent): string {
  return c.path ?? c.key ?? ''
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

function primitiveOrUndefined(v: unknown): string | number | boolean | undefined {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined
}

/**
 * Open the overlay for a field and resolve once the operator commits or
 * cancels. The Verify-button decoration calls this; the overlay resolves it
 * via {@link completeScan} / {@link cancelScan}.
 */
function requestScan(target: InjiScanTarget): Promise<VerifiedVc | null> {
  return new Promise((resolve) => {
    if (isOpen.value && resolveScan.value) {
      resolveScan.value(null)
    }
    currentTarget.value = target
    resolveScan.value = resolve
    isOpen.value = true
  })
}

/**
 * Apply a verified VC to the form: fill the tapped field, then fan out to
 * every sibling field declaring the same `injiTemplate` and currently empty.
 * Records provenance for each filled field, deduping the raw VC by digest.
 *
 * Rescanning a *different* VC over fields already verified by another VC is
 * gated: returns `needsOverwriteConfirm` (and mutates nothing) unless
 * `overwriteConfirmed` is passed.
 */
function completeScan(vc: VerifiedVc, opts: { overwriteConfirmed?: boolean } = {}): CompleteScanResult {
  const target = currentTarget.value
  if (!target) return { filled: [] }

  const template = target.templateId
  const digest = vc.rawDigest

  // Gather candidate components: the tapped field is always a candidate; the
  // rest are same-template fields.
  const candidates: InjiFormComponent[] = []
  target.formRoot.everyComponent((c) => {
    const tpl = c.component?.properties?.injiTemplate
    if (tpl && tpl === template) candidates.push(c)
  })

  // Overwrite gate. Two conflict kinds require operator confirmation:
  //  - vc:     an already-verified field bound to a DIFFERENT credential.
  //  - manual: the tapped field holds an operator-typed value that differs
  //            from the incoming claim (a valid VC for the wrong beneficiary
  //            can't be auto-detected — the human confirm is the safeguard).
  // Fan-out fields with a manual value are skipped (not overwritten), so they
  // never raise a manual conflict.
  const conflicts: InjiOverwriteConflict[] = []
  for (const c of candidates) {
    const path = fieldPathOf(c)
    const claimPath = c.component?.properties?.injiClaimPath
    if (!path || !claimPath) continue
    const newValue = extractClaim(vc.claims, claimPath)
    if (newValue === undefined) continue
    const existing = verifications[path]
    const current = c.getValue?.()
    const isTarget = path === target.fieldPath
    if (existing && existing.vcDigest !== digest) {
      conflicts.push({ path, label: c.component?.label, claimPath, oldValue: current, newValue, kind: 'vc' })
    } else if (!existing && isTarget && !isEmptyValue(current) && current !== newValue) {
      conflicts.push({ path, label: c.component?.label, claimPath, oldValue: current, newValue, kind: 'manual' })
    }
  }
  if (conflicts.length && !opts.overwriteConfirmed) {
    return { filled: [], needsOverwriteConfirm: conflicts.map((c) => c.path), conflicts }
  }

  const verifiedAt = new Date().toISOString()
  const filled: string[] = []
  const noValue: string[] = []

  for (const c of candidates) {
    const path = fieldPathOf(c)
    const claimPath = c.component?.properties?.injiClaimPath
    if (!path || !claimPath) continue

    const value = extractClaim(vc.claims, claimPath)
    if (value === undefined) {
      // Right credential, but no value for this field — surface, don't fill.
      noValue.push(path)
      continue
    }

    const isTarget = path === target.fieldPath
    const current = c.getValue?.()
    // Fill the explicitly tapped field always; fan-out only fills empties
    // (unless the operator confirmed an overwrite).
    if (!isTarget && !isEmptyValue(current) && !opts.overwriteConfirmed) {
      // already has a value and not part of an overwrite — skip
      if (!verifications[path]) continue
    }

    c.setValue?.(value)
    c.redraw?.()

    verifications[path] = {
      vcDigest: digest,
      template,
      claimPath,
      claimValue: primitiveOrUndefined(value),
      verifiedAt
    }
    filled.push(path)
  }

  if (filled.length) {
    scannedVcs[digest] = {
      rawVc: vc.raw,
      format: vc.format,
      issuerDid: vc.issuerDid,
      issuedAt: vc.issuedAt,
      expiresAt: vc.expiresAt
    }
  }

  // Resolve the pending requestScan promise and close the overlay.
  if (resolveScan.value) {
    resolveScan.value(vc)
    resolveScan.value = null
  }
  isOpen.value = false
  currentTarget.value = null

  return { filled, ...(noValue.length ? { noValue } : {}) }
}

/**
 * Undo a field's verification: drop its provenance entry, clear the field value
 * (returning it to editable), and drop the credential record when no remaining
 * field references it. Used by the field "Remove verification" affordance to
 * correct a mistaken scan.
 */
function removeVerification(fieldPath: string, formRoot?: InjiFormRoot): void {
  const rec = verifications[fieldPath]
  if (!rec) return
  delete verifications[fieldPath]

  const comp = formRoot?.getComponent?.(fieldPath)
  comp?.setValue?.('')
  comp?.redraw?.()

  // Drop the credential only when nothing else still references its digest.
  const stillUsed = Object.values(verifications).some((v) => v.vcDigest === rec.vcDigest)
  if (!stillUsed) delete scannedVcs[rec.vcDigest]
}

function cancelScan(): void {
  if (resolveScan.value) {
    resolveScan.value(null)
    resolveScan.value = null
  }
  isOpen.value = false
  currentTarget.value = null
}

function getFieldVerification(fieldPath: string): InjiVerificationRecord | undefined {
  return verifications[fieldPath]
}

/**
 * Emit the two `_inji*` provenance objects for merging into submission data.
 * Returns `null` when nothing was verified this session (so we never write
 * empty objects onto the entity).
 */
function serializeForSave(): InjiSerializedProvenance | null {
  if (!Object.keys(verifications).length) return null
  return {
    _injiCredentials: { ...scannedVcs },
    _injiVerifications: { ...verifications }
  }
}

/**
 * Rebuild session state from persisted `entity.data` so verified badges show
 * when an existing entity is reopened for editing.
 */
function hydrate(data: Record<string, unknown> | null | undefined): void {
  reset()
  if (!data) return
  const creds = data._injiCredentials as Record<string, InjiCredentialRecord> | undefined
  const vers = data._injiVerifications as Record<string, InjiVerificationRecord> | undefined
  if (creds && typeof creds === 'object') {
    for (const [k, v] of Object.entries(creds)) scannedVcs[k] = v
  }
  if (vers && typeof vers === 'object') {
    for (const [k, v] of Object.entries(vers)) verifications[k] = v
  }
}

function reset(): void {
  for (const k of Object.keys(scannedVcs)) delete scannedVcs[k]
  for (const k of Object.keys(verifications)) delete verifications[k]
  currentTarget.value = null
  if (resolveScan.value) {
    resolveScan.value(null)
    resolveScan.value = null
  }
  isOpen.value = false
}

export function useInjiVerification() {
  return {
    // overlay-facing reactive state
    isOpen,
    currentTarget,
    // session API
    requestScan,
    completeScan,
    cancelScan,
    removeVerification,
    getFieldVerification,
    serializeForSave,
    hydrate,
    reset,
    // raw maps (read-only use in DetailView / tests)
    scannedVcs,
    verifications
  }
}
