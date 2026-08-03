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

/**
 * Playwright e2e for the Form.io builder iframe -> Vue migration.
 *
 * Goal: prove the form-design surface
 *   (a) no longer ships the legacy iframe pointing at `/formio-builder.html`,
 *   (b) renders the new <FormioBuilder>'s `.formio-builder-host` mount node,
 *   (c) actually loads @formio/js — verified by the presence of the Form.io
 *       builder palette wrapper (`.formcomponents`).
 *
 * Surface under test: the wizard's `FormDesigner.vue` reached via
 * `/programs/wizard/forms/<i>/design`. The legacy `ConfigCreateView` ->
 * `FormBuilderDialog` path also embeds `FormioBuilder`, but the router now
 * redirects `/create` -> `wizard-general` (see `router/index.ts`), so the
 * wizard is the live consumer of the migrated component and the right place
 * to smoke-test.
 *
 * Auth + draft: all backend calls are mocked via `page.route`. The wizard's
 * `FormsStep` and `FormDesigner` make no API calls of their own — the draft
 * is initialised client-side in the router's `beforeEach` guard. Only the
 * auth token (planted via `addInitScript`) and the `/api/users/refresh`
 * fallback are required.
 */

import { test, expect, type Page } from '@playwright/test'

const TENANT_ID = 'demo'

function makeFakeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      id: 'admin-1',
      email: 'admin@datacollect.lan',
      role: 'ADMIN',
      tenantIds: [TENANT_ID],
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  ).toString('base64url')
  return `${header}.${payload}.signature-not-verified`
}

async function seedAuth(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('token', token)
  }, makeFakeJwt())
}

async function mockApi(page: Page) {
  // The wizard form-design path does not hit the backend, but the auth store
  // can opportunistically refresh — short-circuit any such call so the test
  // does not depend on a running server.
  await page.route('**/api/users/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: makeFakeJwt() }),
    })
  })
}

test.describe('FormioBuilder migration smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page)
    await mockApi(page)
  })

  test('wizard form-design route mounts FormioBuilder (no iframe, palette renders)', async ({
    page,
  }) => {
    // Enter the wizard at the Forms step. The router's `beforeEach`
    // initialises a fresh client-side draft on entry.
    await page.goto('/programs/wizard/forms')

    // Empty-state: a single "Add Entity Form" button is rendered. Use the
    // accessible name rather than a CSS path — Vuetify markup is verbose.
    await page.getByRole('button', { name: /Add Entity Form/i }).first().click()

    // Once a form exists, the per-card "Design Form" CTA is the entry point
    // to FormDesigner.vue at /programs/wizard/forms/0/design.
    await page.getByRole('button', { name: /Design Form/i }).first().click()
    await expect(page).toHaveURL(/\/programs\/wizard\/forms\/0\/design$/)

    // (a) No legacy iframe — the migration removed the bridge to
    // `public/formio-builder.html`.
    expect(await page.locator('iframe[src*="formio-builder.html"]').count()).toBe(0)

    // (b) The Vue wrapper's mount host is present and visible.
    await expect(page.locator('.formio-builder-host')).toBeVisible()

    // (c) Form.io actually loaded and mounted: the palette wrapper renders
    // inside the builder DOM. This is the strongest single signal that
    // @formio/js was imported, CSS injected, and `Formio.builder(...)`
    // resolved successfully.
    await expect(page.locator('.formcomponents').first()).toBeVisible()
  })
})
