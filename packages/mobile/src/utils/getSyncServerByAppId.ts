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

export const getSyncServerUrlByAppId = async (appId: string) => {
  if (cache.has(appId)) {
    return cache.get(appId)
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
    .then((result) => {
      return result
    })

  cache.set(appId, tenantApp.syncServerUrl)
  return tenantApp.syncServerUrl
}
