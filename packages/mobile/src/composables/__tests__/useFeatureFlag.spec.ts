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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { envKeyFor, useFeatureFlag } from '@/composables/useFeatureFlag'

const FLAG = 'scopedSync' as const
const KEY = envKeyFor(FLAG)

describe('useFeatureFlag', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('derives env keys from camelCase flag names', () => {
    expect(envKeyFor('scopedSync')).toBe('VITE_FEATURE_SCOPED_SYNC')
  })

  it('defaults scopedSync to true when env is unset', () => {
    vi.stubEnv(KEY, undefined as unknown as string)
    const flag = useFeatureFlag(FLAG)
    expect(flag.value).toBe(true)
  })

  it('honours explicit "true" string', () => {
    vi.stubEnv(KEY, 'true')
    const flag = useFeatureFlag(FLAG)
    expect(flag.value).toBe(true)
  })

  it('honours explicit "false" string', () => {
    vi.stubEnv(KEY, 'false')
    const flag = useFeatureFlag(FLAG)
    expect(flag.value).toBe(false)
  })

  it('falls back to the default on empty string', () => {
    vi.stubEnv(KEY, '')
    const flag = useFeatureFlag(FLAG)
    expect(flag.value).toBe(true)
  })
})
