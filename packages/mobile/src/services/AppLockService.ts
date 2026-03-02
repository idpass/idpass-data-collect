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

import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { BiometricAuth, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'
import { SecureStorageService } from '@/services/SecureStorageService'

const LOCK_STATE_KEY = 'app_lock_state'
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

const lockedRef = ref(true)
let inactivityTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Persists the lock state to secure storage so that if the app process is
 * killed while backgrounded (normal Android behaviour under memory pressure),
 * the app restarts in a locked state rather than an unlocked one.
 */
async function persistLockState(isLocked: boolean): Promise<void> {
  await SecureStorageService.set(LOCK_STATE_KEY, isLocked ? '1' : '0')
}

function resetInactivityTimer(): void {
  if (inactivityTimer !== null) {
    clearTimeout(inactivityTimer)
  }
  inactivityTimer = setTimeout(() => {
    lockedRef.value = true
    persistLockState(true)
  }, INACTIVITY_TIMEOUT_MS)
}

export const AppLockService = {
  /**
   * Reactive ref — use in Vue templates with AppLockService.locked.value
   * or destructure as a computed in the component.
   */
  locked: lockedRef,

  /**
   * Initialise lock state from persisted storage. Call once on app mount.
   * Defaults to locked if no persisted state is found.
   */
  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      lockedRef.value = false
      return
    }
    const stored = await SecureStorageService.get(LOCK_STATE_KEY)
    // Treat missing state as locked (safe default for cold start)
    lockedRef.value = stored !== '0'
  },

  /**
   * Check whether biometric / screen-lock authentication is available on the
   * device. Returns false on web (no-op environment).
   */
  async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
      const info = await BiometricAuth.checkBiometry()
      return info.isAvailable || info.deviceIsSecure
    } catch {
      return false
    }
  },

  /**
   * Prompt the user to authenticate. Resolves to true on success, false on
   * cancellation or unavailability.
   *
   * If the device has no screen lock configured, we warn but allow access so
   * field workers are not blocked from doing their job.
   */
  async authenticate(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      lockedRef.value = false
      return true
    }

    try {
      const info = await BiometricAuth.checkBiometry()
      if (!info.isAvailable && !info.deviceIsSecure) {
        console.warn('AppLockService: device has no screen lock — allowing access without authentication')
        lockedRef.value = false
        await persistLockState(false)
        resetInactivityTimer()
        return true
      }

      await BiometricAuth.authenticate({
        reason: 'Verify your identity to access beneficiary data',
        allowDeviceCredential: true
      })

      lockedRef.value = false
      await persistLockState(false)
      resetInactivityTimer()
      return true
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: BiometryErrorType }).code === BiometryErrorType.userCancel
      ) {
        return false
      }
      console.error('AppLockService: authentication error', err)
      return false
    }
  },

  /**
   * Lock the app immediately and cancel the inactivity timer.
   */
  async lock(): Promise<void> {
    lockedRef.value = true
    await persistLockState(true)
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
  },

  /**
   * Reset the inactivity timer on user interaction. Call from the root
   * component on pointer/touch events.
   */
  resetInactivityTimer
}
