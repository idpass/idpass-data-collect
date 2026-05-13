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
 * OP #947 Phase 4 (C4) — verify the `/devices/:configId` route is gated by
 * the `scopedSync` feature flag. With the flag off, navigation should be
 * redirected to the `home` route instead of mounting `DevicesView`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { envKeyFor } from '@/composables/useFeatureFlag'

const FLAG_KEY = envKeyFor('scopedSync')

// A valid-looking JWT (header.payload.sig) decoded by the auth store on
// boot — payload is `{}` so role/tenantIds are nullish, which is fine; we
// only need `isAuthenticated` to be truthy so the auth guard does not
// preempt the feature-flag guard.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.e30.signature'

describe('router /devices feature-flag gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem('token', FAKE_JWT)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.removeItem('token')
  })

  it('redirects to home when scopedSync is disabled', async () => {
    vi.stubEnv(FLAG_KEY, 'false')

    const { default: router } = await import('@/router')
    await router.push({ name: 'devices', params: { configId: 't1' } })
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('allows navigation when scopedSync is enabled', async () => {
    vi.stubEnv(FLAG_KEY, 'true')

    const { default: router } = await import('@/router')
    await router.push({ name: 'devices', params: { configId: 't1' } })
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('devices')
    expect(router.currentRoute.value.params.configId).toBe('t1')
  })
})
