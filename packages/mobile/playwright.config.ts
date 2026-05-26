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

// Serve a pre-built static bundle by default — deterministic across local
// and CI, no Vite on-demand compile flake on cold starts. Set
// `PLAYWRIGHT_DEV_SERVER=1` to switch to the dev server when iterating
// locally with HMR.
const useDevServer = !!process.env.PLAYWRIGHT_DEV_SERVER

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8081',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: useDevServer
      ? 'VITE_DEVELOP=true pnpm dev:web'
      : 'pnpm run build:web:e2e && pnpm run preview:web',
    port: 8081,
    reuseExistingServer: !process.env.CI,
    // Static build + preview-server boot: build takes 30-60s, preview boots
    // instantly. Give plenty of headroom so a slow CI runner has room.
    timeout: 180_000,
  },
})
