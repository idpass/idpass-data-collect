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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import UsersView from '../UsersView.vue'
import { envKeyFor } from '@/composables/useFeatureFlag'

// Mock the API module so the component is fully isolated.
const mockGetUsers = vi.fn()
const mockUpdateUser = vi.fn()
const mockGetApps = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()

vi.mock('@/api', () => ({
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  getApps: (...args: unknown[]) => mockGetApps(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({ showSnackbar: vi.fn() })),
}))

const vuetify = createVuetify({ components, directives })

let activeWrapper: VueWrapper | null = null

const FLAG_KEY = envKeyFor('scopedSync')

async function mountUsersView() {
  const wrapper = mount(UsersView, {
    attachTo: document.body,
    global: {
      plugins: [vuetify],
    },
  })
  activeWrapper = wrapper
  // Allow `onMounted` -> getUsers/getApps to settle.
  await flushPromises()
  await flushPromises()
  return wrapper
}

/**
 * Open the edit dialog for the first user. Tests below assume one user has
 * already been seeded into `mockGetUsers`.
 */
async function openEditDialog() {
  // The action button uses an mdi-pencil icon. Vuetify renders these as
  // <button> elements inside the data table; querying by `.v-icon--size-default`
  // is fragile, so click via the mdi class on the icon.
  const pencil = document.querySelector('.mdi-pencil') as HTMLElement | null
  expect(pencil).toBeTruthy()
  pencil!.closest('button')!.click()
  await flushPromises()
}

describe('UsersView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockGetApps.mockResolvedValue({ data: [{ id: 'p1', name: 'Program One' }] })
    mockUpdateUser.mockResolvedValue({})
    // Default: feature flag on (default behaviour from useFeatureFlag).
    vi.stubEnv(FLAG_KEY, 'true')
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
    vi.unstubAllEnvs()
  })

  it('renders the per-assignment override section when scopedSync flag is on', async () => {
    mockGetUsers.mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        role: 'USER',
        programIds: ['p1'],
        roleAssignments: [{ programId: 'p1', role: 'USER' }],
      },
    ])
    await mountUsersView()
    await openEditDialog()

    const section = document.querySelector('[data-testid="role-assignments-section"]')
    expect(section).toBeTruthy()

    const row = document.querySelector('[data-testid="role-assignment-row-p1"]')
    expect(row).toBeTruthy()
  })

  it('hides the override section when scopedSync flag is off', async () => {
    vi.stubEnv(FLAG_KEY, 'false')
    mockGetUsers.mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        role: 'USER',
        programIds: ['p1'],
        roleAssignments: [{ programId: 'p1', role: 'USER' }],
      },
    ])
    await mountUsersView()
    await openEditDialog()

    const section = document.querySelector('[data-testid="role-assignments-section"]')
    expect(section).toBeFalsy()
  })

  it('persists syncScopeOverride on save when an override is set', async () => {
    mockGetUsers.mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        role: 'USER',
        programIds: ['p1'],
        roleAssignments: [
          {
            programId: 'p1',
            role: 'USER',
            syncScopeOverride: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
          },
        ],
      },
    ])
    await mountUsersView()
    await openEditDialog()

    // Override exists -> the "Override active" chip should render.
    const activeChip = document.querySelector(
      '[data-testid="role-assignment-override-active-p1"]',
    )
    expect(activeChip).toBeTruthy()

    // Click the dialog's Save button. Vuetify dialogs portal into body, so
    // a body-level query is required.
    const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
    const saveBtn = allButtons.find((b) => b.textContent?.trim() === 'Save')
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()
    await flushPromises()

    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    const payload = mockUpdateUser.mock.calls[0][0]
    expect(payload.id).toBe('u1')
    expect(payload.roleAssignments).toEqual([
      {
        programId: 'p1',
        role: 'USER',
        syncScopeOverride: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
      },
    ])
  })

  it('omits syncScopeOverride when the user clears it', async () => {
    mockGetUsers.mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        role: 'USER',
        programIds: ['p1'],
        roleAssignments: [
          {
            programId: 'p1',
            role: 'USER',
            syncScopeOverride: { areaIds: ['A1'], entityTypes: null, timeWindow: null },
          },
        ],
      },
    ])
    await mountUsersView()
    await openEditDialog()

    // Expand the override panel
    const toggle = document.querySelector(
      '[data-testid="role-assignment-override-toggle-p1"]',
    ) as HTMLButtonElement | null
    expect(toggle).toBeTruthy()
    toggle!.click()
    await flushPromises()

    // Click "Clear override"
    const clearBtn = document.querySelector(
      '[data-testid="role-assignment-override-clear-p1"]',
    ) as HTMLButtonElement | null
    expect(clearBtn).toBeTruthy()
    clearBtn!.click()
    await flushPromises()

    // Save
    const allButtons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
    const saveBtn = allButtons.find((b) => b.textContent?.trim() === 'Save')
    saveBtn!.click()
    await flushPromises()

    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    const payload = mockUpdateUser.mock.calls[0][0]
    expect(payload.roleAssignments).toEqual([{ programId: 'p1', role: 'USER' }])
    expect(payload.roleAssignments[0]).not.toHaveProperty('syncScopeOverride')
  })
})
