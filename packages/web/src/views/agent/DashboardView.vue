<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTenantStore } from '@/stores/tenant'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const tenantStore = useTenantStore()

onMounted(async () => {
  const tenantId = route.params.tenantId as string
  await tenantStore.loadConfig(tenantId)
})
</script>

<template>
  <LoadingState :loading="tenantStore.loading" :error="tenantStore.error">
    <div v-if="tenantStore.currentConfig">
      <h1 class="text-h4 mb-2">{{ tenantStore.currentConfig.name }}</h1>
      <p v-if="tenantStore.currentConfig.description" class="text-body-1 mb-6">
        {{ tenantStore.currentConfig.description }}
      </p>

      <h2 class="text-h6 mb-3">Entity Forms</h2>
      <v-row v-if="tenantStore.currentConfig.entityForms?.length">
        <v-col
          v-for="form in tenantStore.currentConfig.entityForms"
          :key="form.id"
          cols="12"
          sm="6"
          md="4"
        >
          <v-card variant="outlined">
            <v-card-title>{{ form.title || form.name }}</v-card-title>
            <v-card-subtitle>{{ form.id }}</v-card-subtitle>
            <v-card-actions>
              <v-btn
                color="primary"
                variant="text"
                :to="`/agent/${route.params.tenantId}/${form.id}`"
              >
                View Entities
              </v-btn>
              <v-btn
                color="accent"
                variant="text"
                :to="`/agent/${route.params.tenantId}/${form.id}/new`"
              >
                Create
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
      <v-alert v-else type="info" variant="tonal">
        No entity forms configured for this program.
      </v-alert>
    </div>
  </LoadingState>
</template>
