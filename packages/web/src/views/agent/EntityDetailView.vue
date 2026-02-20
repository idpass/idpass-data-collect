<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getEntities, getEntityEvents, type EntityRecord, type EventRecord } from '@/api/entities'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const entity = ref<EntityRecord | null>(null)
const events = ref<EventRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const tenantId = route.params.tenantId as string
const entityType = route.params.entity as string
const guid = route.params.guid as string

onMounted(async () => {
  try {
    const allEntities = await getEntities(tenantId)
    entity.value = allEntities.find((e) => e.guid === guid) ?? null
    if (entity.value) {
      events.value = await getEntityEvents(guid, tenantId)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load entity'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/agent/${tenantId}/${entityType}`" />
      <h1 class="text-h4 ml-2">Entity Detail</h1>
      <v-spacer />
      <v-btn
        color="primary"
        :to="`/agent/${tenantId}/${entityType}/${guid}/edit`"
        prepend-icon="mdi-pencil"
      >
        Edit
      </v-btn>
    </div>

    <LoadingState :loading="loading" :error="error">
      <v-card v-if="entity" class="mb-4">
        <v-card-title>{{ entity.name || entity.entityName || entity.guid }}</v-card-title>
        <v-card-subtitle>{{ entity.type }} &middot; {{ entity.guid }}</v-card-subtitle>
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr v-for="(value, key) in entity.data" :key="key">
                <td class="font-weight-medium">{{ key }}</td>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <h2 class="text-h6 mb-3">Event History</h2>
      <v-timeline v-if="events.length" density="compact" side="end">
        <v-timeline-item
          v-for="event in events"
          :key="event.guid"
          size="small"
          dot-color="primary"
        >
          <v-card variant="outlined" density="compact">
            <v-card-title class="text-body-1">{{ event.type }}</v-card-title>
            <v-card-subtitle>
              {{ new Date(event.timestamp).toLocaleString() }} &middot; {{ event.userId }}
            </v-card-subtitle>
          </v-card>
        </v-timeline-item>
      </v-timeline>
      <v-alert v-else type="info" variant="tonal">No events recorded.</v-alert>
    </LoadingState>
  </div>
</template>
