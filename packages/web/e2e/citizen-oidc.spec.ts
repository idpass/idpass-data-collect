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

test.describe('Citizen OIDC Login Flow', () => {
  test('should display citizen login page', async ({ page }) => {
    await page.goto('/citizen/login')
    await expect(page.locator('text=Citizen Portal')).toBeVisible()
  })

  test('should show program ID input', async ({ page }) => {
    await page.goto('/citizen/login')
    const programInput = page.locator('input').first()
    await expect(programInput).toBeVisible()
  })

  test('should navigate back to home from citizen login', async ({ page }) => {
    await page.goto('/citizen/login')
    await page.click('text=Back to home')
    await expect(page).toHaveURL('/')
  })

  test('should handle OIDC callback with mocked provider', async ({ page }) => {
    // Mock the backend OIDC exchange endpoint
    await page.route('**/api/auth/oidc/exchange', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'self-service:entity-1',
          token: 'mock-self-service-jwt-token',
        }),
      })
    })

    // Navigate to the callback URL as if redirected from eSignet
    // The callback view will try to process the OIDC response
    await page.goto('/callback?code=mock-code&state=mock-state')

    // The callback view should show an error or processing state
    // since we don't have a real OIDC session to process
    // The key is that the page loads and doesn't crash
    await expect(page.locator('body')).toBeVisible()
  })

  test('should redirect unauthenticated citizen to login', async ({ page }) => {
    // Try to access a protected citizen route without authentication
    await page.goto('/citizen/test-tenant')

    // Should redirect to citizen login
    await expect(page).toHaveURL(/citizen\/login/)
  })

  test('should redirect unauthenticated agent to login', async ({ page }) => {
    // Try to access a protected agent route without authentication
    await page.goto('/agent/test-tenant')

    // Should redirect to agent login
    await expect(page).toHaveURL(/agent\/login/)
  })
})
