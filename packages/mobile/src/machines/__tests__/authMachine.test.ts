import { describe, it, expect } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import { authMachine } from '../authMachine'
import type { AuthContext, InitializeResult, LoginResult, CallbackResult, DefaultLoginResult, RefreshResult } from '../types'

const mockAuthManager = {
  login: async () => {},
  logout: async () => {},
  isAuthenticated: async () => false,
  handleCallback: async () => {}
}

const mockStorage = {
  getLastProvider: async () => null,
  setLastProvider: async () => {},
  saveTemporaryOAuthData: async () => {},
  getTemporaryOAuthData: async () => ({ provider: 'auth0' }),
  clearTemporaryOAuthData: async () => {},
  clearLastProvider: async () => {}
}

function createTestMachine(overrides: {
  initResult?: { isAuthenticated: boolean; currentProvider?: string | null; availableProviders?: string[] }
  initError?: Error
  loginError?: Error
  callbackResult?: { provider: string }
  callbackError?: Error
  defaultLoginResult?: { isAuthenticated: boolean }
  refreshResult?: { isAuthenticated: boolean; currentProvider?: string | null }
  logoutError?: Error
} = {}) {
  const {
    initResult = { isAuthenticated: false, currentProvider: null, availableProviders: [] },
    initError,
    loginError,
    callbackResult = { provider: 'auth0' },
    callbackError,
    defaultLoginResult = { isAuthenticated: false },
    refreshResult = { isAuthenticated: true, currentProvider: null },
    logoutError
  } = overrides

  return authMachine.provide({
    actors: {
      initializeAuth: fromPromise<InitializeResult, { appId: string }>(async () => {
        if (initError) throw initError
        return {
          authManager: mockAuthManager as unknown as InitializeResult['authManager'],
          mobileAuthStorage: mockStorage as unknown as InitializeResult['mobileAuthStorage'],
          isAuthenticated: initResult.isAuthenticated,
          currentProvider: initResult.currentProvider ?? null,
          availableProviders: initResult.availableProviders ?? []
        }
      }),
      performLogin: fromPromise<LoginResult, { context: AuthContext; provider: string | null; credentials?: { username: string; password: string } | { token: string } }>(async () => {
        if (loginError) throw loginError
        return { success: true as const }
      }),
      processOAuthCallback: fromPromise<CallbackResult, { context: AuthContext }>(async () => {
        if (callbackError) throw callbackError
        return callbackResult
      }),
      handleDefaultLogin: fromPromise<DefaultLoginResult, { context: AuthContext }>(async () => {
        return defaultLoginResult
      }),
      refreshAuthState: fromPromise<RefreshResult, { context: AuthContext }>(async () => {
        return {
          isAuthenticated: refreshResult.isAuthenticated,
          currentProvider: refreshResult.currentProvider ?? null
        }
      }),
      performLogout: fromPromise<void, { context: AuthContext; appId: string }>(async () => {
        if (logoutError) throw logoutError
      })
    }
  })
}

function waitForState(
  actor: ReturnType<typeof createActor>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate: (snap: any) => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('waitForState timed out')), 2000)
    if (predicate(actor.getSnapshot())) {
      clearTimeout(timeout)
      resolve()
      return
    }
    const sub = actor.subscribe((snap) => {
      if (predicate(snap)) {
        clearTimeout(timeout)
        sub.unsubscribe()
        resolve()
      }
    })
  })
}

describe('authMachine', () => {
  it('starts in idle state', () => {
    const actor = createActor(createTestMachine())
    actor.start()
    expect(actor.getSnapshot().matches('idle')).toBe(true)
    actor.stop()
  })

  it('INITIALIZE transitions to unauthenticated when not authenticated', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => !s.matches('initializing'))

    expect(actor.getSnapshot().matches('unauthenticated')).toBe(true)
    expect(actor.getSnapshot().context.appId).toBe('test-app')
    actor.stop()
  })

  it('INITIALIZE transitions to authenticated when already authenticated', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: true, currentProvider: 'auth0', availableProviders: ['auth0'] }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => !s.matches('initializing'))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    expect(actor.getSnapshot().context.currentProvider).toBe('auth0')
    expect(actor.getSnapshot().context.availableProviders).toEqual(['auth0'])
    actor.stop()
  })

  it('INITIALIZE transitions to error on failure', async () => {
    const machine = createTestMachine({
      initError: new Error('Network error')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('error'))

    expect(actor.getSnapshot().context.error).toBe('Network error')
    actor.stop()
  })

  it('LOGIN transitions unauthenticated → authenticated on success', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('unauthenticated'))

    actor.send({ type: 'LOGIN', provider: 'auth0', credentials: { username: 'user', password: 'pass' } })
    await waitForState(actor, (s) => !s.matches({ unauthenticated: 'loggingIn' }))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    actor.stop()
  })

  it('LOGIN transitions back to unauthenticated on failure', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: false },
      loginError: new Error('Invalid credentials')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('unauthenticated'))

    actor.send({ type: 'LOGIN', provider: 'auth0' })
    await waitForState(actor, (s) => s.matches({ unauthenticated: 'idle' }))

    expect(actor.getSnapshot().context.error).toBe('Invalid credentials')
    actor.stop()
  })

  it('HANDLE_CALLBACK transitions to authenticated on success', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: false },
      callbackResult: { provider: 'keycloak' }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('unauthenticated'))

    actor.send({ type: 'HANDLE_CALLBACK' })
    await waitForState(actor, (s) => !s.matches({ unauthenticated: 'handlingCallback' }))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    expect(actor.getSnapshot().context.currentProvider).toBe('keycloak')
    actor.stop()
  })

  it('HANDLE_CALLBACK returns to unauthenticated on error', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: false },
      callbackError: new Error('No provider available')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('unauthenticated'))

    actor.send({ type: 'HANDLE_CALLBACK' })
    await waitForState(actor, (s) => s.matches({ unauthenticated: 'idle' }))

    expect(actor.getSnapshot().context.error).toBe('No provider available')
    actor.stop()
  })

  it('LOGOUT transitions authenticated → unauthenticated', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: true }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('authenticated'))

    actor.send({ type: 'LOGOUT', appId: 'test-app' })
    await waitForState(actor, (s) => !s.matches('loggingOut'))

    expect(actor.getSnapshot().matches('unauthenticated')).toBe(true)
    expect(actor.getSnapshot().context.currentProvider).toBeNull()
    actor.stop()
  })

  it('LOGOUT returns to authenticated on error', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: true },
      logoutError: new Error('Logout failed')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('authenticated'))

    actor.send({ type: 'LOGOUT', appId: 'test-app' })
    await waitForState(actor, (s) => !s.matches('loggingOut'))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    expect(actor.getSnapshot().context.error).toBe('Logout failed')
    actor.stop()
  })

  it('REFRESH keeps authenticated when still authenticated', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: true },
      refreshResult: { isAuthenticated: true, currentProvider: 'auth0' }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('authenticated'))

    actor.send({ type: 'REFRESH' })
    await waitForState(actor, (s) => !s.matches({ authenticated: 'refreshing' }))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    expect(actor.getSnapshot().context.currentProvider).toBe('auth0')
    actor.stop()
  })

  it('REFRESH transitions to unauthenticated when no longer authenticated', async () => {
    const machine = createTestMachine({
      initResult: { isAuthenticated: true },
      refreshResult: { isAuthenticated: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('authenticated'))

    actor.send({ type: 'REFRESH' })
    await waitForState(actor, (s) => !s.matches({ authenticated: 'refreshing' }))

    expect(actor.getSnapshot().matches('unauthenticated')).toBe(true)
    actor.stop()
  })

  it('RESET from error returns to idle with cleared context', async () => {
    const machine = createTestMachine({
      initError: new Error('Init failed')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('error'))

    actor.send({ type: 'RESET' })
    expect(actor.getSnapshot().matches('idle')).toBe(true)
    expect(actor.getSnapshot().context.error).toBeNull()
    expect(actor.getSnapshot().context.appId).toBeNull()
    actor.stop()
  })

  it('can re-initialize from error state', async () => {
    let callCount = 0
    const machine = authMachine.provide({
      actors: {
        initializeAuth: fromPromise<InitializeResult, { appId: string }>(async () => {
          callCount++
          if (callCount === 1) throw new Error('First attempt failed')
          return {
            authManager: mockAuthManager as unknown as InitializeResult['authManager'],
            mobileAuthStorage: mockStorage as unknown as InitializeResult['mobileAuthStorage'],
            isAuthenticated: true,
            currentProvider: 'auth0',
            availableProviders: ['auth0']
          }
        }),
        performLogin: fromPromise<LoginResult, { context: AuthContext; provider: string | null; credentials?: { username: string; password: string } | { token: string } }>(async () => ({ success: true as const })),
        processOAuthCallback: fromPromise<CallbackResult, { context: AuthContext }>(async () => ({ provider: 'auth0' })),
        handleDefaultLogin: fromPromise<DefaultLoginResult, { context: AuthContext }>(async () => ({ isAuthenticated: false })),
        refreshAuthState: fromPromise<RefreshResult, { context: AuthContext }>(async () => ({ isAuthenticated: true, currentProvider: null })),
        performLogout: fromPromise<void, { context: AuthContext; appId: string }>(async () => {})
      }
    })

    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => s.matches('error'))

    actor.send({ type: 'INITIALIZE', appId: 'test-app' })
    await waitForState(actor, (s) => !s.matches('initializing'))

    expect(actor.getSnapshot().matches('authenticated')).toBe(true)
    actor.stop()
  })
})
