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
import { setActivePinia, createPinia } from 'pinia'
import { useInjiConfig } from '../useInjiConfig'
import { useTenantStore } from '@/store/tenant'

describe('useInjiConfig', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('returns enabled=false when no tenant', () => {
    const result = useInjiConfig()
    expect(result.value.enabled).toBe(false)
    expect(result.value.trustedIssuers).toEqual([])
    expect(result.value.credentialTemplates).toEqual([])
  })

  it('returns enabled=false when tenant has no inji block', () => {
    const tenantStore = useTenantStore()
    ;(tenantStore as { tenant: unknown }).tenant = { id: 'x', inji: undefined }
    const result = useInjiConfig()
    expect(result.value.enabled).toBe(false)
  })

  it('returns enabled=false when block exists but disabled', () => {
    const tenantStore = useTenantStore()
    ;(tenantStore as { tenant: unknown }).tenant = {
      id: 'x',
      inji: {
        enabled: false,
        trustedIssuers: [{ issuerId: 'x', publicKey: {} }],
        credentialTemplates: []
      }
    }
    const result = useInjiConfig()
    expect(result.value.enabled).toBe(false)
  })

  it('returns enabled=false when issuers list is empty', () => {
    const tenantStore = useTenantStore()
    ;(tenantStore as { tenant: unknown }).tenant = {
      id: 'x',
      inji: { enabled: true, trustedIssuers: [], credentialTemplates: [] }
    }
    const result = useInjiConfig()
    expect(result.value.enabled).toBe(false)
  })

  it('returns enabled=true with issuers + templates when fully configured', () => {
    const tenantStore = useTenantStore()
    ;(tenantStore as { tenant: unknown }).tenant = {
      id: 'x',
      inji: {
        enabled: true,
        trustedIssuers: [{ issuerId: 'did:web:x', publicKey: { es256: 'AAAA' } }],
        credentialTemplates: [
          { id: 'birth-cert-v1', matchTypes: ['VerifiableCredential'], expectedFormat: 'jwt-vc' }
        ]
      }
    }
    const result = useInjiConfig()
    expect(result.value.enabled).toBe(true)
    expect(result.value.trustedIssuers).toHaveLength(1)
    expect(result.value.credentialTemplates).toHaveLength(1)
  })
})
