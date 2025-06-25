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

import { useDatabase } from '@/database'
import { defineStore } from 'pinia'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { ref } from 'vue'
export const useTenantStore = defineStore('tenant', () => {
  const database = useDatabase()
  const tenant = ref<TenantAppData | null>(null)
  const getTenant = async (appId: string) => {
    const foundDocuments = await database.tenantapps
      .find({
        selector: { id: appId }
      })
      .exec()
    tenant.value = foundDocuments[0]
    return foundDocuments[0]
  }

  return {
    getTenant,
    tenant
  }
})
