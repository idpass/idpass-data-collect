<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getEntities, type EntityRecord } from '@/api/entities'
import { useEntitySearch } from '@/composables/useEntitySearch'
import LoadingState from '@/components/LoadingState.vue'
import EntityCard from '@/components/EntityCard.vue'

const route = useRoute()
const router = useRouter()
const allEntities = ref<EntityRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const tenantId = route.params.tenantId as string
const entityType = route.params.entity as string

const { searchQuery, filteredEntities } = useEntitySearch(allEntities)

async function loadData() {
  loading.value = true
  error.value = null
  try {
    allEntities.value = await getEntities(tenantId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load entities'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function viewEntity(guid: string) {
  router.push(`/agent/${tenantId}/${entityType}/${guid}`)
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/agent/${tenantId}`" />
      <h1 class="text-h4 ml-2">{{ entityType }}</h1>
      <v-spacer />
      <v-btn color="primary" :to="`/agent/${tenantId}/${entityType}/new`" prepend-icon="mdi-plus">
        Create
      </v-btn>
    </div>

    <v-text-field
      v-model="searchQuery"
      prepend-inner-icon="mdi-magnify"
      label="Search entities..."
      variant="outlined"
      density="compact"
      clearable
      class="mb-4"
    />

    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <div v-if="filteredEntities.length">
        <p class="text-caption mb-2">
          {{ filteredEntities.length }} of {{ allEntities.length }} entities
        </p>
        <EntityCard
          v-for="entity in filteredEntities"
          :key="entity.guid"
          :guid="entity.guid"
          :type="entity.type"
          :name="entity.name || entity.entityName"
          :last-updated="entity.lastUpdated"
          @click="viewEntity(entity.guid)"
        />
      </div>
      <v-alert v-else-if="searchQuery" type="info" variant="tonal">
        No entities matching "{{ searchQuery }}".
      </v-alert>
      <v-alert v-else type="info" variant="tonal"> No entities found. </v-alert>
    </LoadingState>
  </div>
</template>
