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

import type { Page } from '@playwright/test'

export const TEST_APP_ID = 'e2e-test-app'
export const TEST_SYNC_URL = 'http://localhost:3000'

/**
 * Tenant config fixture matching TenantAppSchema.
 * Primary key is `name`. All required fields included.
 */
export const TEST_TENANT_CONFIG = {
  id: TEST_APP_ID,
  name: 'E2E Test App',
  description: 'Test app for e2e',
  version: '1.0.0',
  url: TEST_SYNC_URL,
  syncServerUrl: TEST_SYNC_URL,
  entityForms: [
    {
      id: 'person',
      name: 'person',
      title: 'Person',
      formio: {
        display: 'form',
        components: [
          {
            key: 'name',
            type: 'textfield',
            input: true,
            label: 'Name',
            validate: { required: true },
          },
        ],
      },
    },
  ],
  entityData: [],
  externalSync: {},
  authConfigs: [{ type: 'default', fields: {} }],
}

/**
 * Seed a tenant app config into RxDB via the dev-mode window.db handle.
 * Requires VITE_DEVELOP=true so window.db is exposed (database/index.ts:223).
 * Must be called after navigating to a page so the app has initialized.
 */
export async function seedTenantConfig(
  page: Page,
  config: Record<string, unknown> = TEST_TENANT_CONFIG,
) {
  await page.waitForFunction(
    () => {
      const db = (window as Record<string, unknown>).db as
        | { tenantapps?: unknown }
        | undefined
      return db?.tenantapps
    },
    null,
    { timeout: 15000 },
  )
  await page.evaluate(async (cfg) => {
    const db = (window as Record<string, unknown>).db as {
      tenantapps: { upsert: (doc: unknown) => Promise<unknown> }
    }
    await db.tenantapps.upsert(cfg)
  }, config)
}

/**
 * Mock auth API endpoints for form-based login.
 */
export async function mockAuthApis(page: Page) {
  await page.route('**/api/users/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-jwt-token-e2e',
        userId: 'e2e-user-123',
      }),
    })
  })

  await page.route('**/api/users/check-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Token is valid' }),
    })
  })
}

/**
 * Mock sync server push/pull endpoints.
 */
export async function mockSyncApis(
  page: Page,
  options?: { failPush?: boolean },
) {
  await page.route('**/api/sync/push', async (route) => {
    if (options?.failPush) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Sync push failed' }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    }
  })

  await page.route('**/api/sync/pull**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], nextCursor: null }),
    })
  })
}

/**
 * Clear all browser state (IndexedDB, localStorage, sessionStorage) for a
 * clean test slate. Each test should call this in beforeEach.
 * Navigates to the app first so that the page context has access to storage APIs.
 */
export async function clearAppState(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    // Delete the known RxDB database by name rather than enumerating
    // (indexedDB.databases() is not available on about:blank)
    indexedDB.deleteDatabase('idpass-data-collect')
    localStorage.clear()
    sessionStorage.clear()
  })
  // Reload so the app re-initializes with clean state
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Perform full login flow and navigate to the app view.
 * Sets up tenant config, auth mocks, sync mocks, and logs in.
 */
export async function loginAndNavigateToApp(page: Page) {
  await page.goto('/')
  await seedTenantConfig(page)
  await mockAuthApis(page)
  await mockSyncApis(page)

  await page.goto(`/app/${TEST_APP_ID}/login`)
  await page.fill('input[type="email"]', 'test@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.click('button[type="submit"]')
  // Wait for AppView to render. The Sync button only exists there — using it
  // as the landing signal avoids the URL-glob race on CI where the auth
  // machine briefly bounces the user back to /login between push and the
  // router guard's auth re-check.
  await page.locator('button:has-text("Sync")').waitFor({ state: 'visible', timeout: 25000 })
}
