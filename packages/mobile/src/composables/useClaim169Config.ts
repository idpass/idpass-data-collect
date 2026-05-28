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

import { computed, ComputedRef } from 'vue'
import { useTenantStore } from '@/store/tenant'

export interface Claim169RuntimeConfig {
  enabled: boolean
  trustedIssuers: Array<{
    issuerId: string
    publicKey: { ed25519?: string; es256?: string }
  }>
}

/**
 * Read the tenant-level Claim-169 trust config. Single source of truth for
 * the AppView quick-scan path. Returns enabled=false when the block is
 * missing, the flag is off, or the trustedIssuers list is empty —
 * consumers gate UI on `.enabled` so an unconfigured tenant hides the
 * scan-as-search button entirely.
 *
 * No fallback to form-embedded `claim169Scanner` config — the form scanner
 * still owns its own trustedIssuers for the auto-fill path, but the
 * quick-scan path is purely tenant-level.
 */
export function useClaim169Config(): ComputedRef<Claim169RuntimeConfig> {
  const tenantStore = useTenantStore()
  return computed(() => {
    const c = tenantStore.tenant?.claim169
    if (!c?.enabled || !c.trustedIssuers?.length) {
      return { enabled: false, trustedIssuers: [] }
    }
    return { enabled: true, trustedIssuers: c.trustedIssuers }
  })
}
