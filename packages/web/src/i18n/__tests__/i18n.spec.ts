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

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('setLocaleFromTenant', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('sets locale to browser language when it matches tenant languages', async () => {
    Object.defineProperty(globalThis.navigator, 'language', {
      value: 'fr-FR',
      configurable: true,
    })
    const { i18n, setLocaleFromTenant } = await import('../index')
    setLocaleFromTenant(['en', 'fr'])
    expect(i18n.global.locale.value).toBe('fr')
  })

  it('falls back to first tenant language when browser language does not match', async () => {
    Object.defineProperty(globalThis.navigator, 'language', {
      value: 'de-DE',
      configurable: true,
    })
    const { i18n, setLocaleFromTenant } = await import('../index')
    setLocaleFromTenant(['fr', 'en'])
    expect(i18n.global.locale.value).toBe('fr')
  })

  it('keeps default locale when languages array is empty', async () => {
    Object.defineProperty(globalThis.navigator, 'language', {
      value: 'en-US',
      configurable: true,
    })
    const { i18n, setLocaleFromTenant } = await import('../index')
    const originalLocale = i18n.global.locale.value
    setLocaleFromTenant([])
    expect(i18n.global.locale.value).toBe(originalLocale)
  })

  it('uses first segment of browser language for matching', async () => {
    Object.defineProperty(globalThis.navigator, 'language', {
      value: 'en-GB',
      configurable: true,
    })
    const { i18n, setLocaleFromTenant } = await import('../index')
    setLocaleFromTenant(['en', 'fr'])
    expect(i18n.global.locale.value).toBe('en')
  })
})
