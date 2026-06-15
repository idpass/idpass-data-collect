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
import type { InjiTrustedIssuer, InjiCredentialTemplate } from '@/utils/formIoUtils'

export interface InjiRuntimeConfig {
  enabled: boolean
  trustedIssuers: InjiTrustedIssuer[]
  credentialTemplates: InjiCredentialTemplate[]
}

/**
 * Read the tenant-level Inji trust config. Single source of truth for the
 * per-field VC verification path. Returns enabled=false when the block is
 * missing, the flag is off, or the trustedIssuers list is empty — consumers
 * gate the field "Verify" affordance on `.enabled` so an unconfigured tenant
 * hides verification entirely.
 *
 * Mirrors {@link useClaim169Config}. No network at verify time: trust anchors
 * are resolved purely from this tenant config.
 */
export function useInjiConfig(): ComputedRef<InjiRuntimeConfig> {
  const tenantStore = useTenantStore()
  return computed(() => {
    const c = tenantStore.tenant?.inji
    if (!c?.enabled || !c.trustedIssuers?.length) {
      return { enabled: false, trustedIssuers: [], credentialTemplates: [] }
    }
    return {
      enabled: true,
      trustedIssuers: c.trustedIssuers,
      credentialTemplates: c.credentialTemplates ?? []
    }
  })
}
