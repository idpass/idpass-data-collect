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

import { ref, watch, onUnmounted, getCurrentInstance } from "vue";
import { searchEntities, type EntityRecord } from "@/api/entities";

const DEBOUNCE_MS = 300;

export function useServerSearch(configId: string) {
  const searchQuery = ref("");
  const searchResults = ref<EntityRecord[]>([]);
  const searching = ref(false);
  const searchError = ref<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let latestRequestId = 0;

  watch(searchQuery, (query) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const trimmed = (query ?? "").trim();
    if (!trimmed) {
      searchResults.value = [];
      searchError.value = null;
      searching.value = false;
      return;
    }

    debounceTimer = setTimeout(async () => {
      const requestId = ++latestRequestId;
      searching.value = true;
      searchError.value = null;

      try {
        const criteria = [{ name: { $regex: trimmed } }];
        const results = await searchEntities(configId, criteria);
        if (requestId === latestRequestId) {
          searchResults.value = results;
        }
      } catch (error) {
        if (requestId === latestRequestId) {
          searchError.value = error instanceof Error ? error.message : "Search failed";
          searchResults.value = [];
        }
      } finally {
        if (requestId === latestRequestId) {
          searching.value = false;
        }
      }
    }, DEBOUNCE_MS);
  });

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    });
  }

  return {
    searchQuery,
    searchResults,
    searching,
    searchError,
  };
}
