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

test.describe('Admin Login Flow', () => {
  test('should redirect unauthenticated users to login page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should display the login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.goto('/login')

    const usernameField = page.locator('input[name="username"]')
    await usernameField.click()
    await usernameField.blur()

    await expect(page.locator('text=Field is required')).toBeVisible()
  })

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[name="username"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.locator('button[type="submit"], .v-btn:has-text("Login")').first().click()

    await expect(
      page.locator('text=Invalid username or password').or(page.locator('text=An error occurred')),
    ).toBeVisible()
  })

  test('should show loading state when submitting', async ({ page }) => {
    // Mock the login endpoint (actual endpoint is /api/users/login)
    await page.route('**/api/users/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      })
    })

    await page.goto('/login')
    await page.fill('input[name="username"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.locator('.v-btn:has-text("Login")').click()

    // The button should show a loading state (Vuetify adds v-btn--loading)
    await expect(page.locator('.v-btn--loading')).toBeVisible()
  })
})
