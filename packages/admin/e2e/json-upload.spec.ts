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
import path from 'path'
import fs from 'fs'
import os from 'os'

test.describe('JSON Config Upload', () => {
  let tmpDir: string

  test.beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-upload-'))
  })

  test.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTmpJson(filename: string, content: object): string {
    const filePath = path.join(tmpDir, filename)
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2))
    return filePath
  }

  async function loginAndMockApis(page: import('@playwright/test').Page) {
    // Mock login endpoint
    await page.route('**/api/users/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: { email: 'admin@example.com', role: 'ADMIN' },
        }),
      })
    })

    // Mock token check
    await page.route('**/api/users/check-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Token is valid' }),
      })
    })

    // Mock apps list (empty initially)
    await page.route('**/api/apps?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { total: 0, page: 1, pageSize: 12, totalPages: 0, sortBy: 'name', sortOrder: 'asc', search: '' },
        }),
      })
    })

    await page.goto('/login')
    await page.fill('input[name="username"]', 'admin@example.com')
    await page.fill('input[type="password"]', 'password')
    await page.locator('.v-btn:has-text("Sign in")').click()
    await expect(page).toHaveURL('/')
  }

  test('should upload a downloaded config JSON file successfully', async ({ page }) => {
    await loginAndMockApis(page)

    // Simulate a config that was downloaded (includes extra fields like syncServerUrl, artifactId, null values)
    const downloadedConfig = {
      id: 'test-upload-config',
      name: 'Test Upload Config',
      description: null,
      version: null,
      url: null,
      entityForms: [
        {
          id: 'test-form',
          name: 'Test Form',
          title: 'Test Form',
          dependsOn: null,
          formio: { components: [] },
        },
      ],
      entityData: null,
      externalSync: null,
      authConfigs: null,
      syncServerUrl: 'http://localhost:3000',
      artifactId: 'abc123def456',
    }
    const filePath = writeTmpJson('downloaded-config.json', downloadedConfig)

    // Mock the POST /api/apps upload endpoint
    await page.route('**/api/apps', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', artifactId: 'new-artifact-id' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            meta: { total: 0, page: 1, pageSize: 12, totalPages: 0, sortBy: 'name', sortOrder: 'asc', search: '' },
          }),
        })
      }
    })

    // Click the import button to open the dialog
    await page.locator('.v-btn.v-btn--icon:has(.mdi-upload)').click()
    await expect(page.locator('.v-dialog')).toBeVisible()

    // Upload the file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    // Click Import button
    await page.locator('.v-dialog .v-btn:has-text("Import")').click()

    // Verify success snackbar
    await expect(page.locator('.v-snackbar')).toContainText('imported successfully')
  })

  test('should show error for invalid JSON file', async ({ page }) => {
    await loginAndMockApis(page)

    const filePath = writeTmpJson('invalid.json', { invalid: true })

    // Click the import button
    await page.locator('.v-btn.v-btn--icon:has(.mdi-upload)').click()
    await expect(page.locator('.v-dialog')).toBeVisible()

    // Upload the invalid file (missing id and name)
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    // Mock POST to return 400
    await page.route('**/api/apps', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid app config JSON' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            meta: { total: 0, page: 1, pageSize: 12, totalPages: 0, sortBy: 'name', sortOrder: 'asc', search: '' },
          }),
        })
      }
    })

    await page.locator('.v-dialog .v-btn:has-text("Import")').click()

    // Should display error in the dialog
    await expect(page.locator('.v-dialog')).toContainText(/error|invalid/i)
  })

  test('should show duplicate error when uploading config with existing ID', async ({ page }) => {
    await loginAndMockApis(page)

    const config = {
      id: 'existing-config',
      name: 'Existing Config',
      entityForms: [],
    }
    const filePath = writeTmpJson('duplicate.json', config)

    // Mock apps search to return the existing config
    await page.route('**/api/apps?**', async (route) => {
      const url = new URL(route.request().url())
      const search = url.searchParams.get('search')
      if (search === 'existing-config') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [{ id: 'existing-config', name: 'Existing Config', artifactId: 'art-1', version: '', entitiesCount: 0, externalSync: {}, description: '' }],
            meta: { total: 1, page: 1, pageSize: 1, totalPages: 1, sortBy: 'name', sortOrder: 'asc', search: 'existing-config' },
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            meta: { total: 0, page: 1, pageSize: 12, totalPages: 0, sortBy: 'name', sortOrder: 'asc', search: '' },
          }),
        })
      }
    })

    // Click the import button
    await page.locator('.v-btn.v-btn--icon:has(.mdi-upload)').click()
    await expect(page.locator('.v-dialog')).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)

    await page.locator('.v-dialog .v-btn:has-text("Import")').click()

    // Should show duplicate ID error
    await expect(page.locator('.v-dialog')).toContainText('already exists')
  })
})
