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

import { computed, type ComputedRef } from 'vue'

/**
 * Feature flags used by the admin UI. Defaults are baked in here so a missing
 * `.env` does not flip a feature off silently. To override at build time set
 * the corresponding `VITE_FEATURE_*` env var (string `"true"`/`"false"`).
 *
 * Add new flags by extending {@link FeatureFlagName}; the env-key derivation
 * (`scopedSync` -> `VITE_FEATURE_SCOPED_SYNC`) is computed in {@link envKeyFor}.
 */
export type FeatureFlagName = 'scopedSync'

const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  // Bounded sync scope UI (sync-scope card, devices view,
  // user override editor). Default-on.
  scopedSync: true,
}

export function envKeyFor(name: FeatureFlagName): string {
  // camelCase -> SCREAMING_SNAKE: insert an underscore before any uppercase
  // letter, then uppercase the whole string. `scopedSync` -> `SCOPED_SYNC`.
  const snake = name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()
  return `VITE_FEATURE_${snake}`
}

export function readFlag(name: FeatureFlagName): boolean {
  const envKey = envKeyFor(name)
  // Read dynamically (via index) rather than via `import.meta.env.VITE_*`
  // literals so the value isn't statically inlined at transform time. Falls
  // back to `process.env` for Node contexts (Vitest, SSR) where
  // `import.meta.env` may not be repopulated by `vi.stubEnv`.
  const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env
  const procEnv =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined> | undefined)
      : undefined
  const raw = procEnv?.[envKey] ?? metaEnv?.[envKey]

  if (raw === undefined || raw === '') {
    return FLAG_DEFAULTS[name] ?? false
  }
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return FLAG_DEFAULTS[name] ?? false
}

/**
 * Returns a reactive boolean for the named flag. Reactive so views can use it
 * directly in template expressions and `v-if` conditions; the value itself is
 * resolved once per call from build-time env (no runtime mutation expected).
 */
export function useFeatureFlag(name: FeatureFlagName): ComputedRef<boolean> {
  return computed(() => readFlag(name))
}
