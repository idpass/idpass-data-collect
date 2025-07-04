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

import { vi } from 'vitest'

// Mock IndexedDB API
const indexedDBMock = {
  open: vi.fn().mockReturnValue({
    result: {
      createObjectStore: vi.fn(),
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn().mockReturnValue({
          add: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          clear: vi.fn(),
        }),
      }),
    },
    onsuccess: null,
    onerror: null,
  }),
  deleteDatabase: vi.fn(),
  databases: vi.fn().mockResolvedValue([]),
}

Object.defineProperty(global, 'indexedDB', {
  value: indexedDBMock,
  writable: true,
})

// Mock IDBKeyRange
Object.defineProperty(global, 'IDBKeyRange', {
  value: {
    bound: vi.fn(),
    only: vi.fn(),
    lowerBound: vi.fn(),
    upperBound: vi.fn(),
  },
  writable: true,
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:8081',
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
  },
  writable: true,
})

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}

// Mock Capacitor App
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

// Mock idpass-data-collect with comprehensive implementations
vi.mock('idpass-data-collect', () => ({
  EntityDataManager: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn().mockResolvedValue(false),
    handleCallback: vi.fn(),
  })),
  AuthConfig: vi.fn().mockImplementation(() => ({})),
  AuthManager: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn().mockResolvedValue(false),
    handleCallback: vi.fn().mockResolvedValue(undefined),
  })),
  EntityStoreImpl: vi.fn().mockImplementation(() => ({})),
  EventStoreImpl: vi.fn().mockImplementation(() => ({})),
  IndexedDbEventStorageAdapter: vi.fn().mockImplementation(() => ({})),
  IndexedDbEntityStorageAdapter: vi.fn().mockImplementation(() => ({})),
  EventApplierService: vi.fn().mockImplementation(() => ({})),
  InternalSyncManager: vi.fn().mockImplementation(() => ({})),
  IndexedDbAuthStorageAdapter: vi.fn().mockImplementation(() => ({})),
}))

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_SYNC_URL: 'http://localhost:3000',
    VITE_FEATURE_DYNAMIC: true,
  },
})

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
}) 