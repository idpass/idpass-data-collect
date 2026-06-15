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

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fake Form.io Field base whose attach we can wrap. Defined inside the mock
// factory (hoisted) and re-exported for the test to instantiate.
vi.mock('formiojs', () => {
  class FakeField {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    root: any
    path = 'dob'
    builderMode = false
    attach(element: HTMLElement) {
      return ['original-ref', element]
    }
  }
  return { default: { Components: { components: { field: FakeField } } } }
})

import Formio from 'formiojs'
import {
  applyInjiVerifiableDecoration,
  __resetInjiVerifiableDecorationForTest
} from '../injiVerifiable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FakeField: any = (Formio as any).Components.components.field

function makeField(props?: Record<string, string>) {
  const f = new FakeField()
  f.component = { properties: props, label: 'Date of birth' }
  f.root = { everyComponent: () => {} }
  f.path = 'dob'
  f.builderMode = false
  return f
}

describe('applyInjiVerifiableDecoration', () => {
  beforeEach(() => {
    __resetInjiVerifiableDecorationForTest()
    applyInjiVerifiableDecoration()
  })

  it('injects exactly one Verify button on a field with properties.injiTemplate', () => {
    const f = makeField({ injiTemplate: 'birth-cert-v1', injiClaimPath: '$.credentialSubject.birthDate' })
    const el = document.createElement('div')
    f.attach(el)
    expect(el.querySelectorAll('.inji-verifiable__btn')).toHaveLength(1)
    expect(el.querySelector('.inji-verifiable__btn')?.textContent).toBe('Verify')
  })

  it('does not decorate a field without the marker', () => {
    const f = makeField(undefined)
    const el = document.createElement('div')
    f.attach(el)
    expect(el.querySelectorAll('.inji-verifiable__btn')).toHaveLength(0)
  })

  it('does not decorate in builder mode', () => {
    const f = makeField({ injiTemplate: 'birth-cert-v1' })
    f.builderMode = true
    const el = document.createElement('div')
    f.attach(el)
    expect(el.querySelectorAll('.inji-verifiable__btn')).toHaveLength(0)
  })

  it('stays idempotent when attach runs twice on the same element (redraw)', () => {
    const f = makeField({ injiTemplate: 'birth-cert-v1', injiClaimPath: '$.x' })
    const el = document.createElement('div')
    f.attach(el)
    f.attach(el)
    expect(el.querySelectorAll('.inji-verifiable__btn')).toHaveLength(1)
  })

  it('preserves the original attach return value', () => {
    const f = makeField({ injiTemplate: 'birth-cert-v1', injiClaimPath: '$.x' })
    const el = document.createElement('div')
    const ret = f.attach(el)
    expect(ret[0]).toBe('original-ref')
  })
})
