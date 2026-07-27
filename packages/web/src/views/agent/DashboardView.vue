<!--
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
-->

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTenantStore } from "@/stores/tenant";
import { useServerSearch } from "@/composables/useServerSearch";
import { getEntities, type EntityRecord } from "@/api/entities";
import LoadingState from "@/components/LoadingState.vue";
import EntityCard from "@/components/EntityCard.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tenantStore = useTenantStore();

const tenantId = route.params.tenantId as string;
const recentEntities = ref<EntityRecord[]>([]);
const recentLoading = ref(false);
const recentError = ref<string | null>(null);

const { searchQuery, searchResults, searching, searchError } = useServerSearch(tenantId);

// Top-level forms are those without dependsOn — these are the register buttons
const topLevelForms = computed(() => {
  return tenantStore.currentConfig?.entityForms?.filter((f) => !f.dependsOn) ?? [];
});

async function loadData() {
  await tenantStore.loadConfig(tenantId);
  recentLoading.value = true;
  recentError.value = null;
  try {
    recentEntities.value = await getEntities(tenantId, 10);
  } catch (err) {
    recentError.value = err instanceof Error ? err.message : "Failed to load recent entities";
  } finally {
    recentLoading.value = false;
  }
}

onMounted(loadData);

function viewEntity(guid: string) {
  router.push(`/agent/${tenantId}/entity/${guid}`);
}
</script>

<template>
  <LoadingState :loading="tenantStore.loading" :error="tenantStore.error">
    <div v-if="tenantStore.currentConfig">
      <h1 class="text-h4 mb-2">{{ tenantStore.currentConfig.name }}</h1>
      <p v-if="tenantStore.currentConfig.description" class="text-body-1 mb-6">
        {{ tenantStore.currentConfig.description }}
      </p>

      <!-- Search bar -->
      <v-text-field
        v-model="searchQuery"
        prepend-inner-icon="mdi-magnify"
        :label="t('agentDashboard.searchEntities')"
        variant="outlined"
        clearable
        class="mb-4"
        :loading="searching"
      />

      <!-- Search error -->
      <v-alert v-if="searchError" type="error" variant="tonal" class="mb-4">
        {{ searchError }}
      </v-alert>

      <!-- Search results -->
      <div v-if="searchQuery?.trim()">
        <p class="text-caption mb-2">
          {{ t("agentDashboard.searchResultsCount", { count: searchResults.length }) }}
        </p>
        <EntityCard
          v-for="entity in searchResults"
          :key="entity.guid"
          :guid="entity.guid"
          :type="entity.type"
          :name="entity.name"
          :entity-name="entity.entityName"
          :last-updated="entity.lastUpdated"
          @click="viewEntity(entity.guid)"
        />
        <v-alert v-if="!searching && searchResults.length === 0" type="info" variant="tonal">
          {{ t("agentDashboard.noSearchResults") }}
        </v-alert>
      </div>

      <!-- Register buttons + Recent entities (shown when not searching) -->
      <div v-else>
        <!-- Register buttons -->
        <div v-if="topLevelForms.length" class="mb-6">
          <h2 class="text-h6 mb-3">{{ t("agentDashboard.register") }}</h2>
          <v-row>
            <v-col v-for="form in topLevelForms" :key="form.id" cols="12" sm="6" md="4">
              <v-card variant="outlined" :to="`/agent/${tenantId}/entity/new/${form.id}`" class="pa-4 text-center">
                <v-icon icon="mdi-plus-circle-outline" size="large" class="mb-2" />
                <v-card-title class="text-body-1">
                  {{ form.title || form.name }}
                </v-card-title>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- Recent entities -->
        <div>
          <h2 class="text-h6 mb-3">{{ t("agentDashboard.recentEntities") }}</h2>
          <LoadingState :loading="recentLoading" :error="recentError" @retry="loadData">
            <div v-if="recentEntities.length">
              <EntityCard
                v-for="entity in recentEntities"
                :key="entity.guid"
                :guid="entity.guid"
                :type="entity.type"
                :name="entity.name"
                :entity-name="entity.entityName"
                :last-updated="entity.lastUpdated"
                @click="viewEntity(entity.guid)"
              />
            </div>
            <v-alert v-else type="info" variant="tonal">
              {{ t("agentDashboard.noEntities") }}
            </v-alert>
          </LoadingState>
        </div>
      </div>
    </div>
  </LoadingState>
</template>
