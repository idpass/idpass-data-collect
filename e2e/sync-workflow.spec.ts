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

import { randomUUID } from 'crypto'
import { test, expect } from '@playwright/test'
import { getAdminToken } from './helpers/auth'
import {
  createAppConfig,
  deleteAppConfig,
  createUser,
  pushEvents,
  getEntities,
  type AppConfig,
} from './helpers/api'

const WEB_URL = process.env.WEB_URL || 'http://localhost:5174'

const TEST_CONFIG_ID = `e2e-sync-${Date.now()}`
const FIELDWORKER_EMAIL = `e2e-sync-fw-${Date.now()}@datacollect.lan`
const FIELDWORKER_PASSWORD = 'Synctest123!'

const testConfig: AppConfig = {
  id: TEST_CONFIG_ID,
  name: 'E2E Sync Test',
  description: 'Auto-generated config for e2e sync testing',
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
        ],
      },
    },
  ],
}

test.describe('Sync Workflow', () => {
  let adminToken: string
  const entityGuid = `e2e-hh-${Date.now()}`

  test.beforeAll(async () => {
    adminToken = await getAdminToken()
    await deleteAppConfig(adminToken, TEST_CONFIG_ID)

    // Set up config, user, and seed data via API
    await createAppConfig(adminToken, testConfig)
    await createUser(
      adminToken,
      FIELDWORKER_EMAIL,
      FIELDWORKER_PASSWORD,
      'USER',
      [TEST_CONFIG_ID],
    )

    // Push a household entity via the sync API
    const now = new Date().toISOString()
    await pushEvents(adminToken, TEST_CONFIG_ID, [
      {
        guid: randomUUID(),
        entityGuid,
        type: 'create-group',
        data: {
          entityName: 'household',
          name: 'Synced Household Beta',
        },
        timestamp: now,
        userId: 'admin',
        syncLevel: 1,
      },
    ])
  })

  test.afterAll(async () => {
    await deleteAppConfig(adminToken, TEST_CONFIG_ID).catch(() => {})
  })

  test('field worker sees server-seeded data after login', async ({
    page,
  }) => {
    // Verify entity exists on the backend
    const entities = await getEntities(adminToken, TEST_CONFIG_ID)
    expect(entities.length).toBeGreaterThanOrEqual(1)

    // Field worker logs in via web UI (using proven selectors from web e2e)
    await page.goto(`${WEB_URL}/agent/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[type="email"]', FIELDWORKER_EMAIL)
    await page.fill('input[type="password"]', FIELDWORKER_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(new RegExp(`/agent/${TEST_CONFIG_ID}`), {
      timeout: 30000,
    })

    // Verify the seeded entity appears in the dashboard
    await expect(page.getByText('Synced Household Beta', { exact: true })).toBeVisible({
      timeout: 30000,
    })
  })

  test('entity state is consistent between web UI and backend API', async ({
    page,
  }) => {
    // Push an additional update event
    const now = new Date().toISOString()
    await pushEvents(adminToken, TEST_CONFIG_ID, [
      {
        guid: randomUUID(),
        entityGuid,
        type: 'update-group',
        data: {
          entityName: 'household',
          name: 'Synced Household Beta (Updated)',
        },
        timestamp: now,
        userId: 'admin',
        syncLevel: 1,
      },
    ])

    // Verify via API
    const entities = await getEntities(adminToken, TEST_CONFIG_ID)
    const household = entities.find(
      (e: Record<string, unknown>) =>
        (e as { guid: string }).guid === entityGuid,
    ) as Record<string, unknown> | undefined
    expect(household).toBeTruthy()

    // Field worker logs in and sees updated data
    await page.goto(`${WEB_URL}/agent/login`)
    await page.waitForLoadState('networkidle')
    await page.fill('input[type="email"]', FIELDWORKER_EMAIL)
    await page.fill('input[type="password"]', FIELDWORKER_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(new RegExp(`/agent/${TEST_CONFIG_ID}`), {
      timeout: 30000,
    })

    await expect(
      page.getByText('Synced Household Beta (Updated)', { exact: true }),
    ).toBeVisible({ timeout: 30000 })
  })
})
