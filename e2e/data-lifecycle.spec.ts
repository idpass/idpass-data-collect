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
import { getAdminToken } from './helpers/auth'
import {
  createAppConfig,
  deleteAppConfig,
  createUser,
  type AppConfig,
} from './helpers/api'

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5173'
const WEB_URL = process.env.WEB_URL || 'http://localhost:5174'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@datacollect.lan'
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'correct horse battery staple 42!'

const TEST_CONFIG_ID = `e2e-lifecycle-${Date.now()}`
const FIELDWORKER_EMAIL = `e2e-fw-${Date.now()}@datacollect.lan`
const FIELDWORKER_PASSWORD = 'testpassword123!'

const testConfig: AppConfig = {
  id: TEST_CONFIG_ID,
  name: 'E2E Lifecycle Test',
  description: 'Auto-generated config for e2e lifecycle testing',
  entityForms: [
    {
      id: 'household',
      name: 'household',
      title: 'Household',
      formio: {
        display: 'form',
        components: [
          {
            key: 'name',
            type: 'textfield',
            input: true,
            label: 'Household Name',
            validate: { required: true },
          },
          {
            key: 'address',
            type: 'textarea',
            input: true,
            label: 'Address',
          },
        ],
      },
    },
    {
      id: 'individual',
      name: 'individual',
      title: 'Individual',
      dependsOn: 'household',
      formio: {
        display: 'form',
        components: [
          {
            key: 'name',
            type: 'textfield',
            input: true,
            label: 'Full Name',
            validate: { required: true },
          },
          {
            key: 'gender',
            type: 'select',
            input: true,
            label: 'Gender',
            data: {
              values: [
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ],
            },
          },
        ],
      },
    },
  ],
}

test.describe('Data Lifecycle', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    // Clean up any previous test config
    await deleteAppConfig(adminToken, TEST_CONFIG_ID)
  })

  test.afterAll(async () => {
    await deleteAppConfig(adminToken, TEST_CONFIG_ID).catch(() => {})
  })

  test('admin creates config, field worker submits data, admin sees it', async ({
    browser,
  }) => {
    // --- Step 1: Create config and field worker via API ---
    await createAppConfig(adminToken, testConfig)
    await createUser(
      adminToken,
      FIELDWORKER_EMAIL,
      FIELDWORKER_PASSWORD,
      'USER',
      [TEST_CONFIG_ID],
    )

    // --- Step 2: Admin logs into admin UI and verifies config exists ---
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    await adminPage.goto(`${ADMIN_URL}/login`)
    await adminPage.getByLabel('Username').fill(ADMIN_EMAIL)
    await adminPage.getByLabel('Password').fill(ADMIN_PASSWORD)
    await adminPage.getByRole('button', { name: 'Login' }).click()

    // Wait for redirect to home (app manager)
    await adminPage.waitForURL(`${ADMIN_URL}/`)

    // Verify our test config appears in the list
    await expect(adminPage.getByText('E2E Lifecycle Test')).toBeVisible({
      timeout: 10000,
    })

    // --- Step 3: Field worker logs into web UI ---
    const webContext = await browser.newContext()
    const webPage = await webContext.newPage()

    await webPage.goto(`${WEB_URL}/agent/login`)
    await webPage.getByLabel(/email/i).fill(FIELDWORKER_EMAIL)
    await webPage.getByLabel(/password/i).fill(FIELDWORKER_PASSWORD)
    await webPage.getByRole('button', { name: /login/i }).click()

    // Should redirect to the agent dashboard for the test tenant
    await webPage.waitForURL(`${WEB_URL}/agent/${TEST_CONFIG_ID}`, {
      timeout: 15000,
    })
    await expect(webPage.getByText('E2E Lifecycle Test')).toBeVisible()

    // --- Step 4: Field worker creates a household ---
    await webPage.getByRole('button', { name: /household/i }).click()
    await webPage.waitForURL(
      new RegExp(`/agent/${TEST_CONFIG_ID}/entity/new/household`),
    )

    // Fill the form.io form
    await webPage
      .locator('input[name="data[name]"], [name="data[name]"]')
      .first()
      .fill('Test Household Alpha')
    await webPage
      .locator(
        'textarea[name="data[address]"], [name="data[address]"]',
      )
      .first()
      .fill('123 Test Street')

    // Submit the form
    await webPage.getByRole('button', { name: /submit/i }).click()

    // Wait for navigation back or confirmation
    await webPage.waitForTimeout(3000)

    // --- Step 5: Verify entity appears in admin UI ---
    await adminPage.goto(
      `${ADMIN_URL}/collection-programs/${TEST_CONFIG_ID}`,
    )
    await adminPage.waitForLoadState('networkidle')

    // The entity list should eventually show our household
    await expect(
      adminPage.getByText('Test Household Alpha'),
    ).toBeVisible({ timeout: 15000 })

    await adminContext.close()
    await webContext.close()
  })
})
