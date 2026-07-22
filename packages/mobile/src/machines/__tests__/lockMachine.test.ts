import { describe, it, expect, vi } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import { lockMachine } from '../lockMachine'
import type { LoadLockStateResult, BiometricResult } from '../types'

function createTestMachine(overrides: {
  loadResult?: { isNativePlatform: boolean; isLocked: boolean }
  loadError?: Error
  authResult?: { success: boolean }
  authError?: Error
} = {}) {
  const {
    loadResult = { isNativePlatform: true, isLocked: true },
    loadError,
    authResult = { success: true },
    authError
  } = overrides

  return lockMachine.provide({
    actors: {
      loadPersistedLockState: fromPromise(async () => {
        if (loadError) throw loadError
        return loadResult
      }),
      biometricAuthenticate: fromPromise(async () => {
        if (authError) throw authError
        return authResult
      }),
      persistLockState: fromPromise(async () => {})
    }
  })
}

function waitForState(
  actor: ReturnType<typeof createActor>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate: (snap: any) => boolean
): Promise<void> {
  return new Promise((resolve) => {
    if (predicate(actor.getSnapshot())) {
      resolve()
      return
    }
    const sub = actor.subscribe((snap) => {
      if (predicate(snap)) {
        sub.unsubscribe()
        resolve()
      }
    })
  })
}

describe('lockMachine', () => {
  it('starts in idle state', () => {
    const actor = createActor(createTestMachine())
    actor.start()
    expect(actor.getSnapshot().matches('idle')).toBe(true)
    actor.stop()
  })

  it('transitions to locked when native platform and was locked', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: true }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => !s.matches('initializing') && !s.matches('idle'))

    expect(actor.getSnapshot().matches('locked')).toBe(true)
    actor.stop()
  })

  it('transitions to unlocked when native platform and was not locked', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => !s.matches('initializing') && !s.matches('idle'))

    expect(actor.getSnapshot().matches('unlocked')).toBe(true)
    actor.stop()
  })

  it('transitions to unlocked on web platform (non-native)', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: false, isLocked: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => !s.matches('initializing') && !s.matches('idle'))

    expect(actor.getSnapshot().matches('unlocked')).toBe(true)
    actor.stop()
  })

  it('transitions locked → authenticating → unlocked on successful biometric', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: true },
      authResult: { success: true }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => s.matches('locked'))

    actor.send({ type: 'AUTHENTICATE' })
    await waitForState(actor, (s) => !s.matches('authenticating'))

    expect(actor.getSnapshot().matches('unlocked')).toBe(true)
    actor.stop()
  })

  it('transitions locked → authenticating → locked on failed biometric', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: true },
      authResult: { success: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => s.matches('locked'))

    actor.send({ type: 'AUTHENTICATE' })
    await waitForState(actor, (s) => !s.matches('authenticating'))

    expect(actor.getSnapshot().matches('locked')).toBe(true)
    expect(actor.getSnapshot().context.error).toBe('Authentication failed or cancelled')
    actor.stop()
  })

  it('transitions locked → authenticating → locked on biometric error', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: true },
      authError: new Error('Sensor failed')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => s.matches('locked'))

    actor.send({ type: 'AUTHENTICATE' })
    await waitForState(actor, (s) => !s.matches('authenticating'))

    expect(actor.getSnapshot().matches('locked')).toBe(true)
    expect(actor.getSnapshot().context.error).toBe('Sensor failed')
    actor.stop()
  })

  it('LOCK event transitions unlocked → locked', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => s.matches('unlocked'))

    actor.send({ type: 'LOCK' })
    // LOCK is synchronous transition
    expect(actor.getSnapshot().matches('locked')).toBe(true)
    actor.stop()
  })

  it('USER_ACTIVITY re-enters unlocked (resets inactivity timer)', async () => {
    const machine = createTestMachine({
      loadResult: { isNativePlatform: true, isLocked: false }
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => s.matches('unlocked'))

    // Sending USER_ACTIVITY should keep it unlocked (re-entry)
    actor.send({ type: 'USER_ACTIVITY' })
    expect(actor.getSnapshot().matches('unlocked')).toBe(true)
    actor.stop()
  })

  it('leaves authenticating and returns to locked when biometric never settles', async () => {
    // Reproduces the on-device hang: the native biometric promise never
    // resolves nor rejects (e.g. cap8 bridge stall on a device with no
    // enrolled biometric). The machine must not stay pinned in
    // `authenticating` — it must self-heal back to `locked` with an error so
    // the lock flow resolves deterministically instead of hanging until the
    // AppLockService 30s waitForState rejects and crashes Vue.
    vi.useFakeTimers()
    try {
      const machine = lockMachine.provide({
        actors: {
          loadPersistedLockState: fromPromise<LoadLockStateResult>(async () => ({
            isNativePlatform: true,
            isLocked: true
          })),
          // Never settles.
          biometricAuthenticate: fromPromise<BiometricResult>(() => new Promise(() => {})),
          persistLockState: fromPromise(async () => {})
        }
      })
      const actor = createActor(machine)
      actor.start()

      actor.send({ type: 'INIT' })
      // Flush the load promise so the machine reaches `locked`.
      await vi.advanceTimersByTimeAsync(0)
      expect(actor.getSnapshot().matches('locked')).toBe(true)

      actor.send({ type: 'AUTHENTICATE' })
      expect(actor.getSnapshot().matches('authenticating')).toBe(true)

      // Advance well past any reasonable biometric deadline. The machine must
      // have left `authenticating` on its own.
      await vi.advanceTimersByTimeAsync(30_000)

      expect(actor.getSnapshot().matches('authenticating')).toBe(false)
      expect(actor.getSnapshot().matches('locked')).toBe(true)
      expect(actor.getSnapshot().context.error).toBeTruthy()
      actor.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles load error by transitioning to unlocked', async () => {
    const machine = createTestMachine({
      loadError: new Error('Storage unavailable')
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'INIT' })
    await waitForState(actor, (s) => !s.matches('initializing') && !s.matches('idle'))

    expect(actor.getSnapshot().matches('unlocked')).toBe(true)
    expect(actor.getSnapshot().context.error).toBe('Storage unavailable')
    actor.stop()
  })
})
