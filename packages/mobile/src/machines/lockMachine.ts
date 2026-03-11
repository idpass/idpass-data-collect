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

import { setup, assign } from 'xstate'
import type { LockContext, LoadLockStateResult, BiometricResult } from './types'
import { loadPersistedLockState, biometricAuthenticate, persistLockState } from './actors/lockActors'

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

export const lockMachine = setup({
  types: {
    context: {} as LockContext,
    events: {} as
      | { type: 'INIT' }
      | { type: 'AUTHENTICATE' }
      | { type: 'LOCK' }
      | { type: 'USER_ACTIVITY' }
  },
  actors: {
    loadPersistedLockState,
    biometricAuthenticate,
    persistLockState
  }
}).createMachine({
  id: 'lock',
  initial: 'idle',
  context: {
    error: null,
    isNativePlatform: false
  },
  states: {
    idle: {
      on: {
        INIT: 'initializing'
      }
    },
    initializing: {
      invoke: {
        src: 'loadPersistedLockState',
        onDone: [
          {
            guard: ({ event }) => {
              const data = event.output as LoadLockStateResult
              return data.isNativePlatform && data.isLocked
            },
            target: 'locked',
            actions: assign({
              isNativePlatform: ({ event }) => (event.output as LoadLockStateResult).isNativePlatform,
              error: null
            })
          },
          {
            target: 'unlocked',
            actions: assign({
              isNativePlatform: ({ event }) => (event.output as LoadLockStateResult).isNativePlatform,
              error: null
            })
          }
        ],
        onError: {
          target: 'unlocked',
          actions: assign({
            error: ({ event }) => event.error instanceof Error ? event.error.message : 'Failed to load lock state'
          })
        }
      }
    },
    locked: {
      invoke: {
        src: 'persistLockState',
        input: { isLocked: true }
      },
      on: {
        AUTHENTICATE: 'authenticating'
      }
    },
    authenticating: {
      invoke: {
        src: 'biometricAuthenticate',
        onDone: [
          {
            guard: ({ event }) => (event.output as BiometricResult).success,
            target: 'unlocked',
            actions: assign({ error: null })
          },
          {
            target: 'locked',
            actions: assign({
              error: 'Authentication failed or cancelled'
            })
          }
        ],
        onError: {
          target: 'locked',
          actions: assign({
            error: ({ event }) => event.error instanceof Error ? event.error.message : 'Authentication error'
          })
        }
      }
    },
    unlocked: {
      invoke: {
        src: 'persistLockState',
        input: { isLocked: false }
      },
      after: {
        [INACTIVITY_TIMEOUT_MS]: 'locked'
      },
      on: {
        USER_ACTIVITY: {
          target: 'unlocked',
          reenter: true
        },
        LOCK: 'locked'
      }
    }
  }
})
