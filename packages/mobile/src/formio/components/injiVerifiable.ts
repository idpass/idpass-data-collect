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
 * Decorates ANY Form.io field that declares `properties.injiTemplate` with a
 * "Verify" affordance + verified badge — without registering a new component
 * type. We wrap `Field.prototype.attach` ONCE (guarded) so the decoration
 * rides every field's attach/redraw lifecycle for free.
 *
 * The wrap is the riskiest piece of the feature: it runs for every field on
 * every redraw, so it must early-return cheaply when the marker is absent and
 * must not inject duplicate nodes.
 */

import Formio from 'formiojs'
import { useInjiVerification, type InjiFormRoot } from '@/composables/useInjiVerification'

const WRAP_FLAG = '__injiVerifiableWrapped'
const NODE_ATTR = 'data-inji-verifiable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyField = any

function escapeText(text: string): string {
  const div = document.createElement('div')
  div.appendChild(document.createTextNode(text))
  return div.innerHTML
}

function buildAffordance(self: AnyField): HTMLElement {
  const fieldPath: string = self.path ?? self.key ?? ''
  const props = self.component?.properties ?? {}
  const templateId: string = props.injiTemplate
  const claimPath: string = props.injiClaimPath ?? ''
  const label: string = self.component?.label ?? fieldPath

  const wrap = document.createElement('div')
  wrap.className = 'inji-verifiable'
  wrap.setAttribute(NODE_ATTR, '1')

  const session = useInjiVerification()
  const existing = session.getFieldVerification(fieldPath)

  if (existing) {
    const badge = document.createElement('span')
    badge.className = 'inji-verifiable__badge inji-verifiable__badge--ok'
    badge.textContent = '✓ Verified'
    badge.title = `Verified via ${existing.template}`
    wrap.appendChild(badge)
  }

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'inji-verifiable__btn'
  btn.textContent = existing ? 'Re-verify' : 'Verify'
  btn.setAttribute('aria-label', `${existing ? 'Re-verify' : 'Verify'} ${escapeText(label)} with a credential`)
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const root = self.root as InjiFormRoot | undefined
    if (!root || typeof root.everyComponent !== 'function') return
    void session.requestScan({ fieldPath, templateId, claimPath, label, formRoot: root })
  })
  wrap.appendChild(btn)

  return wrap
}

let applied = false

/**
 * Idempotent. Wraps `Field.prototype.attach` exactly once. Safe to call from
 * the single `registerCustomComponents` site.
 */
export function applyInjiVerifiableDecoration(): void {
  if (applied) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Field = (Formio as any)?.Components?.components?.field
  if (!Field?.prototype?.attach) return
  if (Field.prototype[WRAP_FLAG]) {
    applied = true
    return
  }

  const originalAttach = Field.prototype.attach
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Field.prototype.attach = function patchedAttach(this: AnyField, element: HTMLElement) {
    const result = originalAttach.call(this, element)

    const templateId = this.component?.properties?.injiTemplate
    // Cheap early-out for the overwhelming majority of fields.
    if (!templateId) return result
    // Never decorate inside the form builder canvas.
    if (this.builderMode || this.options?.attachMode === 'builder') return result
    if (!element || element.querySelector(`[${NODE_ATTR}]`)) return result

    try {
      element.appendChild(buildAffordance(this))
    } catch {
      // Decoration is advisory — never break the field's own attach.
    }
    return result
  }
  Field.prototype[WRAP_FLAG] = true
  applied = true
}

/** Test-only: reset the module guard so the wrap can be re-applied. */
export function __resetInjiVerifiableDecorationForTest(): void {
  applied = false
}
