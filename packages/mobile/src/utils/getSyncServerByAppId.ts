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

import { getDatabase } from '@/database'
const db = getDatabase()
const cache = new Map<string, string>()

export const getSyncServerUrlByAppId = async (appId: string): Promise<string> => {
  const cached = cache.get(appId)
  if (cached) {
    return cached
  }

  const tenantApp = await (
    await db
  ).collections.tenantapps
    .findOne({
      selector: {
        id: appId
      }
    })
    .exec()

  // Fall back to the build-time VITE_SYNC_URL so a tenant config missing the
  // syncServerUrl field (legacy, or self-hosted dev) still resolves cleanly
  // instead of returning undefined and tripping AuthManager downstream.
  const url =
    (tenantApp?.syncServerUrl as string | undefined) ||
    (import.meta.env.VITE_SYNC_URL as string | undefined) ||
    ''

  if (url) cache.set(appId, url)
  return url
}
