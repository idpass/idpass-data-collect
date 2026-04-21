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
import { createActor, type SnapshotFrom } from 'xstate'
import { Capacitor } from '@capacitor/core'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { lockMachine } from '@/machines/lockMachine'

type LockSnapshot = SnapshotFrom<typeof lockMachine>

function stateIs(snap: LockSnapshot, state: string): boolean {
  return (snap as { value: string }).value === state
}

const lockActor = createActor(lockMachine)
lockActor.start()

// Reactive ref kept in sync with the actor snapshot so that existing
// consumers that read `AppLockService.locked.value` continue to work.
const lockedRef = ref(true)

// Subscribe to actor transitions to keep the ref updated
lockActor.subscribe((snap) => {
  lockedRef.value = !stateIs(snap, 'unlocked')
})

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
    lockActor.send({ type: 'INIT' })
    // Wait for the initializing state to resolve
    await waitForState((snap) => !stateIs(snap, 'initializing'))
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
   */
  async authenticate(): Promise<boolean> {
    const snap = lockActor.getSnapshot()
    if (stateIs(snap, 'unlocked')) return true

    lockActor.send({ type: 'AUTHENTICATE' })
    await waitForState((s) => !stateIs(s, 'authenticating'))
    return stateIs(lockActor.getSnapshot(), 'unlocked')
  },

  /**
   * Lock the app immediately and cancel the inactivity timer.
   */
  async lock(): Promise<void> {
    lockActor.send({ type: 'LOCK' })
  },

  /**
   * Reset the inactivity timer on user interaction. Call from the root
   * component on pointer/touch events.
   */
  resetInactivityTimer(): void {
    const snap = lockActor.getSnapshot()
    if (stateIs(snap, 'unlocked')) {
      lockActor.send({ type: 'USER_ACTIVITY' })
    }
  },

  /** Exposed for testing — the underlying XState actor */
  _actor: lockActor
}

/**
 * Wait until the actor reaches a state matching the predicate.
 * Resolves immediately if the predicate already holds.
 * Rejects after timeoutMs to prevent indefinite hangs on mobile.
 */
function waitForState(predicate: (snap: LockSnapshot) => boolean, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (predicate(lockActor.getSnapshot())) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      sub.unsubscribe()
      reject(new Error(`waitForState timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const sub = lockActor.subscribe((snap) => {
      if (predicate(snap)) {
        clearTimeout(timer)
        sub.unsubscribe()
        resolve()
      }
    })
  })
}
