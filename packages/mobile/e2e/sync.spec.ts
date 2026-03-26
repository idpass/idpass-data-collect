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
  loginAndNavigateToApp,
  TEST_APP_ID,
} from './helpers/mocks'

test.describe('Sync Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppState(page)
  })

  test('should show sync status after loading app', async ({ page }) => {
    await loginAndNavigateToApp(page)

    // AppView displays a status chip with text: Synced, Syncing..., Pending sync, or Offline mode
    const statusChip = page.locator('.v-chip').filter({ hasText: /Synced|Syncing|Pending sync|Offline/ })
    await expect(statusChip).toBeVisible({ timeout: 10000 })
  })

  test('should trigger sync on button click', async ({ page }) => {
    await loginAndNavigateToApp(page)

    const syncButton = page.locator('button:has-text("Sync")')
    await expect(syncButton).toBeEnabled({ timeout: 15000 })
    await syncButton.click()

    // AppView.vue line 88: showSuccess('Sync completed successfully!')
    await expect(page.locator('.v-snackbar')).toContainText('Sync completed successfully', {
      timeout: 15000,
    })
  })

  test('should display sync stats', async ({ page }) => {
    await loginAndNavigateToApp(page)

    // AppView renders stat cards with class text-overline for labels
    await expect(page.locator('.text-overline:has-text("Synced")')).toBeVisible()
    await expect(page.locator('.text-overline:has-text("Pending")')).toBeVisible()
    await expect(page.locator('.text-overline:has-text("Forms")')).toBeVisible()
  })

  test('should show error when sync fails', async ({ page }) => {
    await page.goto('/')
    await seedTenantConfig(page)
    await mockAuthApis(page)
    await mockSyncApis(page, { failPush: true })

    await page.goto(`/app/${TEST_APP_ID}/login`)
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL(`**/app/${TEST_APP_ID}`, { timeout: 15000 })

    // Wait for initial auto-sync to finish (it may fail too)
    await page.waitForTimeout(2000)

    // Trigger manual sync
    await page.locator('button:has-text("Sync")').click()

    // Error snackbar should appear
    await expect(page.locator('.v-snackbar')).toBeVisible({ timeout: 15000 })
  })

  test('should show offline indicator when network is lost', async ({ page }) => {
    await loginAndNavigateToApp(page)

    await page.context().setOffline(true)

    // networkUtils.ts listens to window offline event, AppView shows "Offline mode"
    await expect(page.locator('text=Offline mode')).toBeVisible({ timeout: 5000 })

    await page.context().setOffline(false)
    await expect(page.locator('text=Offline mode')).not.toBeVisible({ timeout: 5000 })
  })

  test('should disable sync button when offline', async ({ page }) => {
    await loginAndNavigateToApp(page)

    await page.context().setOffline(true)
    await expect(page.locator('text=Offline mode')).toBeVisible({ timeout: 5000 })

    // AppView.vue line 124: :disabled="syncService.isSyncing || isOffline"
    const syncButton = page.locator('button:has-text("Sync")')
    await expect(syncButton).toBeDisabled()

    await page.context().setOffline(false)
    await expect(syncButton).toBeEnabled({ timeout: 5000 })
  })
})
