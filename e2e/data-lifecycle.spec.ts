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
  pushEvents,
  type AppConfig,
} from './helpers/api'

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5173'
const WEB_URL = process.env.WEB_URL || 'http://localhost:5174'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@datacollect.lan'
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'correct horse battery staple 42!'

const TEST_CONFIG_ID = `e2e-lifecycle-${Date.now()}`
const FIELDWORKER_EMAIL = `e2e-fw-${Date.now()}@datacollect.lan`
const FIELDWORKER_PASSWORD = 'Testpassword123!'

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
    await deleteAppConfig(adminToken, TEST_CONFIG_ID)
  })

  test.afterAll(async () => {
    await deleteAppConfig(adminToken, TEST_CONFIG_ID).catch(() => {})
  })

  test('admin creates config via API, verifies in admin UI, field worker sees it in web UI', async ({
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

    // Seed a household entity via sync API so there's data to verify
    const entityGuid = `e2e-hh-${Date.now()}`
    await pushEvents(adminToken, TEST_CONFIG_ID, [
      {
        guid: `evt-${Date.now()}`,
        entityGuid,
        type: 'create-group',
        data: { entityName: 'household', name: 'Test Household Alpha' },
        timestamp: new Date().toISOString(),
        userId: 'admin',
        syncLevel: 1,
      },
    ])

    // --- Step 2: Admin logs into admin UI and verifies config exists ---
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()

    await adminPage.goto(`${ADMIN_URL}/login`)
    // Admin login uses name="username" (mapped to email) and type="password"
    await adminPage.fill('input[name="username"]', ADMIN_EMAIL)
    await adminPage.fill('input[type="password"]', ADMIN_PASSWORD)
    await adminPage.locator('.v-btn:has-text("Login")').click()

    await adminPage.waitForURL(`${ADMIN_URL}/`)
    await expect(adminPage.getByText('E2E Lifecycle Test')).toBeVisible({
      timeout: 10000,
    })

    // --- Step 3: Field worker logs into web UI ---
    const webContext = await browser.newContext()
    const webPage = await webContext.newPage()

    await webPage.goto(`${WEB_URL}/agent/login`)
    // Web login uses type="email" and type="password" (per existing e2e patterns)
    await webPage.fill('input[type="email"]', FIELDWORKER_EMAIL)
    await webPage.fill('input[type="password"]', FIELDWORKER_PASSWORD)
    await webPage.click('button[type="submit"]')

    // Wait for redirect to agent dashboard
    await webPage.waitForURL(new RegExp(`/agent/${TEST_CONFIG_ID}`), {
      timeout: 15000,
    })
    await expect(webPage.getByText('E2E Lifecycle Test')).toBeVisible()

    await adminContext.close()
    await webContext.close()
  })
})
