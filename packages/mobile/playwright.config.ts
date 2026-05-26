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

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // CI cold-starts Vite per run; the first test on each worker can spend
  // 20-40s waiting for on-demand chunk compilation before AppView mounts.
  // Local typically reuses a warm dev server (much faster). Extra headroom
  // + one retry on CI absorbs the cold-compile flake without masking real
  // regressions (a real bug would fail both attempts).
  timeout: process.env.CI ? 90_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8081',
    headless: true,
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'VITE_DEVELOP=true pnpm dev:web',
    port: 8081,
    reuseExistingServer: !process.env.CI,
    // First Vite compile on CI can take longer than the default 60s.
    timeout: 180_000,
  },
})
