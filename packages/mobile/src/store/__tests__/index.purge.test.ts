/**
 * @vitest-environment jsdom
 */

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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture constructor calls from the mocked core module so we can inspect the
// purgeOutOfScope callback wired into InternalSyncManager.
const ismCalls: unknown[][] = []
const purgeEntitiesNotInMock = vi.fn().mockResolvedValue({
  purgedEntities: 0,
  purgedEvents: 0,
})

vi.mock('@idpass/data-collect-core', () => {
  return {
    AuthConfig: vi.fn().mockImplementation(function () {
      return {}
    }),
    AuthManager: vi.fn().mockImplementation(function () {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
      }
    }),
    DeviceIdentity: vi.fn().mockImplementation(function () {
      return {
        getOrCreateDeviceId: vi.fn().mockResolvedValue('device-test'),
      }
    }),
    EntityDataManager: vi.fn().mockImplementation(function () {
      return {
        purgeEntitiesNotIn: purgeEntitiesNotInMock,
      }
    }),
    EntityStoreImpl: vi.fn().mockImplementation(function () {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
      }
    }),
    EventStoreImpl: vi.fn().mockImplementation(function () {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
      }
    }),
    IndexedDbEventStorageAdapter: vi.fn().mockImplementation(function () {
      return {}
    }),
    IndexedDbEntityStorageAdapter: vi.fn().mockImplementation(function () {
      return {}
    }),
    EventApplierService: vi.fn().mockImplementation(function () {
      return {}
    }),
    InternalSyncManager: vi.fn().mockImplementation(function (...args: unknown[]) {
      ismCalls.push(args)
      return {}
    }),
    IndexedDbAuthStorageAdapter: vi.fn().mockImplementation(function () {
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
      }
    }),
  }
})

// Avoid SecureStorageService side effects.
vi.mock('@/services/SecureStorageService', () => ({
  SecureStorageService: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('initStore — purgeOutOfScope wiring (#947)', () => {
  beforeEach(() => {
    ismCalls.length = 0
    purgeEntitiesNotInMock.mockClear()
    vi.resetModules()
  })

  it('passes a 9th-arg purgeOutOfScope callback to InternalSyncManager', async () => {
    const { initStore } = await import('@/store/index')
    await initStore('purge-app-1', 'http://localhost:3000', [])

    expect(ismCalls.length).toBeGreaterThan(0)
    const lastCall = ismCalls[ismCalls.length - 1]
    // 0=eventStore, 1=entityStore, 2=eventApplierService, 3=syncServerUrl,
    // 4=authStorage, 5=appId, 6=reauthenticate, 7=deviceId, 8=purgeOutOfScope
    expect(lastCall.length).toBe(9)
    expect(typeof lastCall[8]).toBe('function')
  })

  it('callback delegates to entityDataManager.purgeEntitiesNotIn', async () => {
    const { initStore } = await import('@/store/index')
    await initStore('purge-app-2', 'http://localhost:3000', [])

    const lastCall = ismCalls[ismCalls.length - 1]
    const purgeOutOfScope = lastCall[8] as (
      keep: readonly string[],
    ) => Promise<void>

    await purgeOutOfScope(['g1', 'g2'])

    expect(purgeEntitiesNotInMock).toHaveBeenCalledTimes(1)
    expect(purgeEntitiesNotInMock).toHaveBeenCalledWith(['g1', 'g2'])
  })
})
