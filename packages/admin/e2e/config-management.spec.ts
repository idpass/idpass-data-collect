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

test.describe('Config Management', () => {
  test('should redirect to login when accessing home without auth', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing create page without auth', async ({ page }) => {
    await page.goto('/create')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing users page without auth', async ({ page }) => {
    await page.goto('/users')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should show config list after login', async ({ page }) => {
    // Mock login endpoint (actual endpoint is /api/users/login)
    await page.route('**/api/users/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: { email: 'admin@example.com', role: 'admin' },
        }),
      })
    })

    // Mock configs endpoint
    await page.route('**/api/apps', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/login')
    await page.fill('input[name="username"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.locator('.v-btn:has-text("Login")').click()

    // After successful login, should navigate to home
    await expect(page).toHaveURL('/')
  })
})
