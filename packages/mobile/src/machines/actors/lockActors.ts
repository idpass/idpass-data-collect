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

import { fromPromise } from 'xstate'
import { Capacitor } from '@capacitor/core'
import { BiometricAuth, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'
import { SecureStorageService } from '@/services/SecureStorageService'
import type { LoadLockStateResult, BiometricResult } from '../types'

const LOCK_STATE_KEY = 'app_lock_state'

export const loadPersistedLockState = fromPromise<LoadLockStateResult>(async () => {
  const isNativePlatform = Capacitor.isNativePlatform()
  if (!isNativePlatform) {
    return { isNativePlatform: false, isLocked: false }
  }
  const stored = await SecureStorageService.get(LOCK_STATE_KEY)
  // Treat missing state as locked (safe default for cold start)
  return { isNativePlatform: true, isLocked: stored !== '0' }
})

export const biometricAuthenticate = fromPromise<BiometricResult>(async () => {
  if (!Capacitor.isNativePlatform()) {
    return { success: true }
  }

  const info = await BiometricAuth.checkBiometry()
  if (!info.isAvailable && !info.deviceIsSecure) {
    // Device has no screen lock or biometrics — reject to protect PII
    return { success: false, reason: 'device_not_secure' }
  }

  try {
    await BiometricAuth.authenticate({
      reason: 'Verify your identity to access beneficiary data',
      allowDeviceCredential: true
    })
    return { success: true }
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err
      ? (err as { code: BiometryErrorType }).code
      : undefined
    const message = err instanceof Error ? err.message : String(err)
    if (code === BiometryErrorType.userCancel) {
      return { success: false, reason: 'cancelled' }
    }
    return { success: false, reason: `${code ?? 'unknown'}: ${message}` }
  }
})

export const persistLockState = fromPromise<void, { isLocked: boolean }>(async ({ input }) => {
  await SecureStorageService.set(LOCK_STATE_KEY, input.isLocked ? '1' : '0')
})
