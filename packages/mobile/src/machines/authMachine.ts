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
import type {
  AuthContext,
  InitializeResult,
  CallbackResult,
  DefaultLoginResult,
  RefreshResult
} from './types'
import {
  initializeAuth,
  performLogin,
  processOAuthCallback,
  handleDefaultLogin,
  refreshAuthState,
  performLogout
} from './actors/authActors'

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as
      | { type: 'INITIALIZE'; appId: string }
      | { type: 'LOGIN'; provider: string | null; credentials?: { username: string; password: string } | { token: string } }
      | { type: 'HANDLE_CALLBACK' }
      | { type: 'HANDLE_DEFAULT_LOGIN' }
      | { type: 'LOGOUT'; appId: string }
      | { type: 'REFRESH' }
      | { type: 'RESET' }
  },
  actors: {
    initializeAuth,
    performLogin,
    processOAuthCallback,
    handleDefaultLogin,
    refreshAuthState,
    performLogout
  }
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: {
    appId: null,
    authManager: null,
    mobileAuthStorage: null,
    currentProvider: null,
    availableProviders: [],
    error: null
  },
  on: {
    RESET: {
      target: '.idle',
      actions: assign({
        appId: null,
        authManager: null,
        mobileAuthStorage: null,
        currentProvider: null,
        availableProviders: [],
        error: null
      })
    }
  },
  states: {
    idle: {
      on: {
        INITIALIZE: {
          target: 'initializing',
          actions: assign({
            appId: ({ event }) => event.appId,
            error: null
          })
        }
      }
    },
    initializing: {
      invoke: {
        src: 'initializeAuth',
        input: ({ context }) => ({ appId: context.appId! }),
        onDone: [
          {
            guard: ({ event }) => (event.output as InitializeResult).isAuthenticated,
            target: 'authenticated',
            actions: assign({
              authManager: ({ event }) => (event.output as InitializeResult).authManager,
              mobileAuthStorage: ({ event }) => (event.output as InitializeResult).mobileAuthStorage,
              currentProvider: ({ event }) => (event.output as InitializeResult).currentProvider,
              availableProviders: ({ event }) => (event.output as InitializeResult).availableProviders,
              error: null
            })
          },
          {
            target: 'unauthenticated',
            actions: assign({
              authManager: ({ event }) => (event.output as InitializeResult).authManager,
              mobileAuthStorage: ({ event }) => (event.output as InitializeResult).mobileAuthStorage,
              currentProvider: ({ event }) => (event.output as InitializeResult).currentProvider,
              availableProviders: ({ event }) => (event.output as InitializeResult).availableProviders,
              error: null
            })
          }
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error instanceof Error ? event.error.message : 'Failed to initialize auth system'
          })
        }
      }
    },
    unauthenticated: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            LOGIN: 'loggingIn',
            HANDLE_CALLBACK: 'handlingCallback',
            HANDLE_DEFAULT_LOGIN: 'handlingDefaultLogin',
            REFRESH: 'refreshing'
          }
        },
        refreshing: {
          invoke: {
            src: 'refreshAuthState',
            input: ({ context }) => ({ context }),
            onDone: [
              {
                guard: ({ event }) => (event.output as RefreshResult).isAuthenticated,
                target: '#auth.authenticated',
                actions: assign({
                  currentProvider: ({ event }) => (event.output as RefreshResult).currentProvider
                })
              },
              {
                target: 'idle',
                actions: assign({
                  currentProvider: null
                })
              }
            ],
            onError: {
              target: 'idle'
            }
          }
        },
        loggingIn: {
          entry: assign({
            currentProvider: ({ event }) => (event as { type: 'LOGIN'; provider: string | null }).provider
          }),
          invoke: {
            src: 'performLogin',
            input: ({ context, event }) => ({
              context,
              provider: (event as { type: 'LOGIN'; provider: string | null }).provider,
              credentials: (event as { type: 'LOGIN'; credentials?: unknown }).credentials as { username: string; password: string } | { token: string } | undefined
            }),
            onDone: {
              target: '#auth.authenticated',
              actions: assign({ error: null })
            },
            onError: {
              target: 'idle',
              actions: assign({
                error: ({ event }) => event.error instanceof Error ? event.error.message : 'Login failed'
              })
            }
          }
        },
        handlingCallback: {
          invoke: {
            src: 'processOAuthCallback',
            input: ({ context }) => ({ context }),
            onDone: {
              target: '#auth.authenticated',
              actions: assign({
                currentProvider: ({ event }) => (event.output as CallbackResult).provider,
                error: null
              })
            },
            onError: {
              target: 'idle',
              actions: assign({
                error: ({ event }) => event.error instanceof Error ? event.error.message : 'Callback handling failed'
              })
            }
          }
        },
        handlingDefaultLogin: {
          invoke: {
            src: 'handleDefaultLogin',
            input: ({ context }) => ({ context }),
            onDone: [
              {
                guard: ({ event }) => (event.output as DefaultLoginResult).isAuthenticated,
                target: '#auth.authenticated'
              },
              {
                target: 'idle'
              }
            ],
            onError: {
              target: 'idle',
              actions: assign({
                error: ({ event }) => event.error instanceof Error ? event.error.message : 'Default login failed'
              })
            }
          }
        }
      }
    },
    authenticated: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            REFRESH: 'refreshing',
            HANDLE_DEFAULT_LOGIN: 'handlingDefaultLogin'
          }
        },
        handlingDefaultLogin: {
          invoke: {
            src: 'handleDefaultLogin',
            input: ({ context }) => ({ context }),
            onDone: {
              target: 'idle'
            },
            onError: {
              target: 'idle'
            }
          }
        },
        refreshing: {
          invoke: {
            src: 'refreshAuthState',
            input: ({ context }) => ({ context }),
            onDone: [
              {
                guard: ({ event }) => (event.output as RefreshResult).isAuthenticated,
                target: 'idle',
                actions: assign({
                  currentProvider: ({ event }) => (event.output as RefreshResult).currentProvider
                })
              },
              {
                target: '#auth.unauthenticated',
                actions: assign({
                  currentProvider: null
                })
              }
            ],
            onError: {
              target: 'idle'
            }
          }
        }
      },
      on: {
        LOGOUT: 'loggingOut'
      }
    },
    loggingOut: {
      invoke: {
        src: 'performLogout',
        input: ({ context, event }) => ({
          context,
          appId: (event as { type: 'LOGOUT'; appId: string }).appId
        }),
        onDone: {
          target: 'unauthenticated',
          actions: assign({
            currentProvider: null,
            error: null
          })
        },
        onError: {
          target: 'authenticated',
          actions: assign({
            error: ({ event }) => event.error instanceof Error ? event.error.message : 'Logout failed'
          })
        }
      }
    },
    error: {
      on: {
        INITIALIZE: {
          target: 'initializing',
          actions: assign({
            appId: ({ event }) => event.appId,
            error: null
          })
        }
      }
    }
  }
})
