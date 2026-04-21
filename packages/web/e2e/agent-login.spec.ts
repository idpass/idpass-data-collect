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

test.describe('Agent Login Flow', () => {
  test('should display the home page with role selection', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Agent')).toBeVisible()
    await expect(page.locator('text=Citizen')).toBeVisible()
  })

  test('should navigate to agent login page', async ({ page }) => {
    await page.goto('/agent/login')
    await expect(page.locator('text=Agent Login')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/agent/login')

    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.locator('text=Invalid email or password')).toBeVisible()
  })

  test('should have autocomplete attributes on login fields', async ({ page }) => {
    await page.goto('/agent/login')

    const emailField = page.locator('input[type="email"]')
    const passwordField = page.locator('input[type="password"]')

    await expect(emailField).toHaveAttribute('autocomplete', 'email')
    await expect(passwordField).toHaveAttribute('autocomplete', 'current-password')
  })

  test('should disable login button when fields are empty', async ({ page }) => {
    await page.goto('/agent/login')

    const loginButton = page.locator('button[type="submit"]')
    await expect(loginButton).toBeDisabled()
  })
})
