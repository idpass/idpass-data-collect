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

import { test, expect } from '@playwright/test'
import {
  seedTenantConfig,
  mockAuthApis,
  mockSyncApis,
  clearAppState,
  TEST_APP_ID,
} from './helpers/mocks'

test.describe('Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppState(page)
  })

  test('should display login form on auth screen', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)

    await page.goto(`/app/${TEST_APP_ID}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should redirect unauthenticated user to login', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)

    await page.goto(`/app/${TEST_APP_ID}`)
    await page.waitForURL(`**/app/${TEST_APP_ID}/login`, { timeout: 10000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('should login successfully with form credentials', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)
    await mockAuthApis(page)
    await mockSyncApis(page)

    await page.goto(`/app/${TEST_APP_ID}/login`)
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await page.waitForURL(`**/app/${TEST_APP_ID}`, { timeout: 15000 })
  })

  test('should show error on failed login', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)

    await page.route('**/api/users/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      })
    })

    await page.goto(`/app/${TEST_APP_ID}/login`)
    await page.fill('input[type="email"]', 'bad@example.com')
    await page.fill('input[type="password"]', 'wrong')
    await page.click('button[type="submit"]')

    await expect(page.locator('.v-alert, .v-snackbar')).toBeVisible({ timeout: 5000 })
  })

  test('should persist token in localStorage after login', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)
    await mockAuthApis(page)
    await mockSyncApis(page)

    await page.goto(`/app/${TEST_APP_ID}/login`)
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL(`**/app/${TEST_APP_ID}`, { timeout: 15000 })

    // SecureStorageService falls back to localStorage on web.
    // After login, the app stores credentials (sync_cred_{appId}) and
    // last provider ({appId}_last_provider) in localStorage.
    const hasCredentials = await page.evaluate(() => {
      return Object.keys(localStorage).some(
        (k) => k.includes('sync_cred') || k.includes('last_provider'),
      )
    })
    expect(hasCredentials).toBeTruthy()
  })

  test('should allow access to home page without login', async ({ page }) => {
    await page.goto('/')
    // Home page loads without auth — it shows the collection programs list
    await expect(page).toHaveURL('/')
  })
})
