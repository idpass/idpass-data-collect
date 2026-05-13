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

/**
 * Playwright e2e for OP #947 bounded sync scope (Phase 4 admin UI).
 *
 * All HTTP calls are mocked via `page.route` — no backend or DB needed; the
 * Playwright dev server (vite, port 5173) runs the admin SPA in isolation.
 *
 * Test names mirror the QA checklist numbering at
 * `.claude/qa/947-bounded-sync-scope-checklist.md`.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------- Fixtures ----------

const TENANT_ID = 'demo'

interface SyncScopePolicy {
  areaIds?: string[] | null
  entityTypes?: Array<'individual' | 'group'> | null
  timeWindow?: { type: 'rolling'; days: number } | { type: 'fixed'; floor: string } | null
}

interface AppDetail {
  id: string
  name: string
  description?: string
  version?: string
  syncScope?: SyncScopePolicy | null
  entityForms?: unknown[]
  entityData?: unknown[]
  externalSync?: Record<string, unknown>
  authConfigs?: unknown[]
  selfService?: { enabled: boolean; authMethods: string[]; allowedForms: string[]; requireReview: boolean }
}

function makeAppDetail(overrides: Partial<AppDetail> = {}): AppDetail {
  return {
    id: TENANT_ID,
    name: 'Demo Tenant',
    description: 'Seeded household registry tenant for QA',
    version: '1.0.0',
    entityForms: [],
    entityData: [],
    externalSync: {},
    authConfigs: [],
    syncScope: null,
    ...overrides,
  }
}

/**
 * Build a minimal-but-valid JWT (header.payload.signature) so the auth store's
 * `decodeJwtPayload` (split-by-`.` + atob on payload) returns a payload. The
 * signature does NOT need to verify — the SPA never validates it; only the
 * backend does, and the backend is fully mocked.
 */
function makeFakeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      id: 'admin-1',
      email: 'admin@datacollect.lan',
      role: 'ADMIN',
      tenantIds: [TENANT_ID],
      // expire far in the future so initializeAuth doesn't auto-logout
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  ).toString('base64url')
  return `${header}.${payload}.signature-not-verified`
}

async function seedAuth(page: Page) {
  // Inject the token before navigation so the auth store picks it up on init.
  await page.addInitScript((token) => {
    localStorage.setItem('token', token)
  }, makeFakeJwt())
}

interface MockHandlers {
  getApp?: (route: Route) => Promise<void> | void
  patchSyncScope?: (route: Route) => Promise<void> | void
  getUsers?: (route: Route) => Promise<void> | void
  putUser?: (route: Route) => Promise<void> | void
  getDevices?: (route: Route) => Promise<void> | void
  getApps?: (route: Route) => Promise<void> | void
}

async function mockApi(page: Page, handlers: MockHandlers = {}) {
  // Login (in case any test triggers it; most just seed the token).
  await page.route('**/api/users/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: makeFakeJwt(),
        user: { email: 'admin@datacollect.lan', role: 'ADMIN' },
      }),
    })
  })

  // Token refresh — never lock out the test.
  await page.route('**/api/users/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: makeFakeJwt() }),
    })
  })

  // App list (home page) — return one tenant by default. Match both the
  // queryless URL (e.g. `loadPrograms()`) and the paginated form used by
  // AppManagerView. Playwright glob matching does NOT auto-treat `?` as a
  // query separator, so we register two patterns.
  const fulfillApps = async (route: Route) => {
    if (handlers.getApps) return handlers.getApps(route)
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: TENANT_ID,
            artifactId: 'demo-artifact',
            name: 'Demo Tenant',
            version: '1.0.0',
            entitiesCount: 0,
            externalSync: {},
            description: 'Seeded household registry tenant for QA',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          pageSize: 12,
          totalPages: 1,
          sortBy: 'name',
          sortOrder: 'asc',
          search: '',
        },
      }),
    })
  }
  await page.route(/\/api\/apps(\?.*)?$/, fulfillApps)

  // Tenant detail — patch glob is more specific so it must come first.
  await page.route(`**/api/apps/${TENANT_ID}/syncScope`, async (route) => {
    if (handlers.patchSyncScope) return handlers.patchSyncScope(route)
    const req = route.request()
    const body = req.postDataJSON?.() ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', syncScope: body?.syncScope ?? null }),
    })
  })

  await page.route(`**/api/apps/${TENANT_ID}`, async (route) => {
    if (handlers.getApp) return handlers.getApp(route)
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeAppDetail()),
    })
  })

  // Entity counts / list (called by AppDetailsView on mount).
  await page.route(/\/api\/entities\/count-by-form(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  await page.route(/\/api\/entities(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Users — single fieldworker assigned to the demo tenant.
  await page.route('**/api/users', async (route) => {
    if (handlers.getUsers) return handlers.getUsers(route)
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'user-1',
          email: 'fieldworker@datacollect.lan',
          role: 'USER',
          tenantIds: [TENANT_ID],
          roleAssignments: [{ tenantId: TENANT_ID, role: 'USER' }],
        },
      ]),
    })
  })

  await page.route('**/api/users/user-1', async (route) => {
    if (handlers.putUser) return handlers.putUser(route)
    if (route.request().method() !== 'PUT') return route.continue()
    const body = route.request().postDataJSON?.() ?? {}
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'user-1', ...body }),
    })
  })

  // Devices telemetry.
  await page.route(/\/api\/admin\/devices(\?.*)?$/, async (route) => {
    if (handlers.getDevices) return handlers.getDevices(route)
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          tenantId: TENANT_ID,
          userId: 'user-1',
          deviceId: 'device-aaaa-1111',
          lastPullAt: '2026-05-01T10:00:00.000Z',
          lastPushAt: '2026-05-01T10:05:00.000Z',
          totalPulled: 12,
          totalPushed: 3,
          lastScopeHash: 'hash-1',
        },
      ]),
    })
  })
}

// ---------- §1: Smoke ----------

test.describe('§1: smoke — sync scope plumbing', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page)
    await mockApi(page)
  })

  test('§1.2: tenant detail shows sync scope card + DevicesView kebab item', async ({ page }) => {
    await page.goto(`/collection-programs/${TENANT_ID}`)
    // Wait for AppDetailsView to render (sync scope card has stable testid)
    await expect(page.getByTestId('sync-scope-summary')).toBeVisible()
    // Open the kebab. Vuetify renders `:icon="mdi-dots-vertical"` as a child
    // <i class="mdi-dots-vertical">; click the parent button.
    await page
      .locator('button')
      .filter({ has: page.locator('.mdi-dots-vertical') })
      .first()
      .click()
    await expect(page.getByTestId('app-details-devices-link')).toBeVisible()
  })

  test('§1.5: DevicesView shows at least one device row', async ({ page }) => {
    await page.goto(`/devices/${TENANT_ID}`)
    // The table renders one row from the mock; assert by deviceId text content.
    await expect(page.getByText('device-aaaa-1111')).toBeVisible()
    await expect(page.getByText('user-1').first()).toBeVisible()
  })
})

// ---------- §5: Admin UI ----------

test.describe('§5: admin UI — sync scope card & override editor', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page)
  })

  test('§5.1: card shows Unbounded by default', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/collection-programs/${TENANT_ID}`)
    const summary = page.getByTestId('sync-scope-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('Unbounded')
  })

  test('§5.2: edit dialog blocks save when areas toggled but textarea empty', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/collection-programs/${TENANT_ID}`)
    await page.getByTestId('sync-scope-edit-btn').click()
    // Toggle "Restrict by area IDs" on. Vuetify nests the actual <input> inside
    // the v-checkbox wrapper that carries our data-testid; click the label by
    // accessible name to flip the checkbox reliably.
    await page.getByLabel('Restrict by area IDs').check()
    // The textarea now mounts (v-if). Save must disable until at least one id.
    const saveBtn = page.getByTestId('sync-scope-save-btn')
    await expect(saveBtn).toBeDisabled()
    await expect(
      page.getByText('Areas: remove or add at least one value'),
    ).toBeVisible()
  })

  test('§5.3: save persists policy and PATCH receives areaIds', async ({ page }) => {
    let capturedPatchBody: unknown = null
    let getCallCount = 0
    await mockApi(page, {
      getApp: async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        getCallCount += 1
        // First load = unbounded; subsequent loads (after PATCH) reflect saved policy.
        const policy: SyncScopePolicy | null =
          getCallCount === 1 ? null : { areaIds: ['A1'] }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeAppDetail({ syncScope: policy })),
        })
      },
      patchSyncScope: async (route) => {
        capturedPatchBody = route.request().postDataJSON?.() ?? null
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            syncScope: (capturedPatchBody as { syncScope?: SyncScopePolicy | null } | null)
              ?.syncScope ?? null,
          }),
        })
      },
    })
    await page.goto(`/collection-programs/${TENANT_ID}`)

    await page.getByTestId('sync-scope-edit-btn').click()
    await page.getByLabel('Restrict by area IDs').check()
    // Vuetify v-textarea: target by accessible label (more stable than CSS).
    await page.getByRole('textbox', { name: /Area IDs/i }).fill('A1')
    await page.getByTestId('sync-scope-save-btn').click()

    // PATCH body should have areaIds: ["A1"].
    await expect.poll(() => capturedPatchBody).toMatchObject({
      syncScope: { areaIds: ['A1'] },
    })

    // Summary chip updates to reflect "1 areas".
    const summary = page.getByTestId('sync-scope-summary')
    await expect(summary).toContainText('1 areas')
  })

  test('§5.4: clear policy issues PATCH with null and reverts to Unbounded', async ({ page }) => {
    let capturedPatchBody: unknown = null
    await mockApi(page, {
      getApp: async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeAppDetail({ syncScope: { areaIds: ['A1', 'A2'] } }),
          ),
        })
      },
      patchSyncScope: async (route) => {
        capturedPatchBody = route.request().postDataJSON?.() ?? null
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', syncScope: null }),
        })
      },
    })
    await page.goto(`/collection-programs/${TENANT_ID}`)

    // Open edit, click "Clear policy", confirm.
    await page.getByTestId('sync-scope-edit-btn').click()
    await page.getByTestId('sync-scope-clear-btn').click()
    await page.getByTestId('sync-scope-clear-confirm-btn').click()

    await expect.poll(() => capturedPatchBody).toMatchObject({ syncScope: null })

    // Card returns to Unbounded.
    await expect(page.getByTestId('sync-scope-summary')).toContainText('Unbounded')
  })

  test('§5.5: per-assignment override editor saves and persists', async ({ page }) => {
    let capturedPutBody: unknown = null
    let getUsersCallCount = 0
    await mockApi(page, {
      getUsers: async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        getUsersCallCount += 1
        // Second call (after save + reload) returns the persisted override.
        const override = getUsersCallCount === 1 ? undefined : { areaIds: ['A1'] }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'user-1',
              email: 'fieldworker@datacollect.lan',
              role: 'USER',
              tenantIds: [TENANT_ID],
              roleAssignments: [
                {
                  tenantId: TENANT_ID,
                  role: 'USER',
                  ...(override ? { syncScopeOverride: override } : {}),
                },
              ],
            },
          ]),
        })
      },
      putUser: async (route) => {
        capturedPutBody = route.request().postDataJSON?.() ?? null
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'user-1' }),
        })
      },
    })

    await page.goto('/users')
    // Open edit dialog for user-1.
    await page
      .locator('button')
      .filter({ has: page.locator('.mdi-pencil') })
      .first()
      .click()

    // Expand the override editor for the demo tenant assignment.
    await page.getByTestId(`role-assignment-override-toggle-${TENANT_ID}`).click()
    // Toggle "Restrict by area IDs" inside the per-assignment SyncScopeForm.
    // The override body has its own labels — use the one inside the body.
    const overrideBody = page.getByTestId(`role-assignment-override-body-${TENANT_ID}`)
    await overrideBody.getByLabel('Restrict by area IDs').check()
    await overrideBody.getByRole('textbox', { name: /Area IDs/i }).fill('A1')

    // Save user. There are multiple "Save" buttons in the layout; pick the one
    // inside the visible dialog.
    await page
      .locator('.v-overlay--active .v-btn:has-text("Save")')
      .first()
      .click()

    await expect.poll(() => capturedPutBody).toMatchObject({
      roleAssignments: [
        {
          tenantId: TENANT_ID,
          syncScopeOverride: { areaIds: ['A1'] },
        },
      ],
    })

    // Reload users page, expand again, assert override persisted.
    await page.goto('/users')
    await page
      .locator('button')
      .filter({ has: page.locator('.mdi-pencil') })
      .first()
      .click()
    await expect(
      page.getByTestId(`role-assignment-override-active-${TENANT_ID}`),
    ).toBeVisible()
  })

  test('§5.6: invalid override blocks user save with snackbar', async ({ page }) => {
    let putCalled = false
    await mockApi(page, {
      putUser: async (route) => {
        putCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'user-1' }),
        })
      },
    })

    await page.goto('/users')
    await page
      .locator('button')
      .filter({ has: page.locator('.mdi-pencil') })
      .first()
      .click()
    await page.getByTestId(`role-assignment-override-toggle-${TENANT_ID}`).click()
    // Toggle areas on but leave textarea empty → invalid.
    const overrideBody = page.getByTestId(`role-assignment-override-body-${TENANT_ID}`)
    await overrideBody.getByLabel('Restrict by area IDs').check()

    await page
      .locator('.v-overlay--active .v-btn:has-text("Save")')
      .first()
      .click()

    // The save handler shows a snackbar and never calls PUT.
    await expect(
      page.getByText(/Fix sync-scope override errors/i),
    ).toBeVisible()
    // Confirm no network write happened.
    expect(putCalled).toBe(false)
  })

  test('§5.7: kebab nav from app details opens DevicesView for the tenant', async ({ page }) => {
    await mockApi(page)
    await page.goto(`/collection-programs/${TENANT_ID}`)
    await page
      .locator('button')
      .filter({ has: page.locator('.mdi-dots-vertical') })
      .first()
      .click()
    await page.getByTestId('app-details-devices-link').click()

    await expect(page).toHaveURL(new RegExp(`/devices/${TENANT_ID}$`))
    await expect(page.getByText('Per-device sync activity')).toBeVisible()
  })
})

// ---------- §7.1: Multi-device telemetry visibility ----------

test.describe('§7: multi-device telemetry', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page)
  })

  test('§7.1: two devices same user both visible in DevicesView', async ({ page }) => {
    await mockApi(page, {
      getDevices: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              tenantId: TENANT_ID,
              userId: 'user-1',
              deviceId: 'device-aaaa-1111',
              lastPullAt: '2026-05-01T10:00:00.000Z',
              lastPushAt: null,
              totalPulled: 5,
              totalPushed: 0,
              lastScopeHash: 'hash-1',
            },
            {
              tenantId: TENANT_ID,
              userId: 'user-1',
              deviceId: 'device-bbbb-2222',
              lastPullAt: '2026-05-02T11:00:00.000Z',
              lastPushAt: '2026-05-02T11:30:00.000Z',
              totalPulled: 8,
              totalPushed: 2,
              lastScopeHash: 'hash-1',
            },
          ]),
        })
      },
    })

    await page.goto(`/devices/${TENANT_ID}`)
    await expect(page.getByText('device-aaaa-1111')).toBeVisible()
    await expect(page.getByText('device-bbbb-2222')).toBeVisible()
    // Both rows reference the same user.
    await expect(page.getByText('user-1')).toHaveCount(2)
  })
})
