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

import { ref, watch, type Ref } from 'vue'
import type { EntityRecord } from '@/api/entities'

export function useEntitySearch(allEntities: Ref<EntityRecord[]>) {
  const searchQuery = ref('')
  const filteredEntities = ref<EntityRecord[]>([])

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function filterEntities() {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) {
      filteredEntities.value = allEntities.value
      return
    }
    filteredEntities.value = allEntities.value.filter((entity) => {
      const name = (entity.name || entity.entityName || '').toLowerCase()
      const guid = entity.guid.toLowerCase()
      const type = entity.type.toLowerCase()
      const dataStr = JSON.stringify(entity.data).toLowerCase()
      return (
        name.includes(query) || guid.includes(query) || type.includes(query) || dataStr.includes(query)
      )
    })
  }

  watch(searchQuery, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(filterEntities, 300)
  })

  watch(
    allEntities,
    () => {
      filterEntities()
    },
    { immediate: true },
  )

  return {
    searchQuery,
    filteredEntities,
  }
}
