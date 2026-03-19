<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getSelfServiceEntity, type SelfServiceEntity } from '@/api/selfService'
import { formatLabel } from '@/utils/format'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const entityData = ref<SelfServiceEntity | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const tenantId = route.params.tenantId as string

async function loadData() {
  loading.value = true
  error.value = null
  try {
    entityData.value = await getSelfServiceEntity()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load profile'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// Fields to hide from the profile display
const hiddenFields = new Set(['oidcSubject', 'password', 'passwordHash', 'secret'])
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/citizen/${tenantId}`" />
      <h1 class="text-h4 ml-2">{{ $t('profile.title') }}</h1>
    </div>

    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <v-card v-if="entityData" variant="outlined">
        <v-card-text>
          <v-table density="comfortable">
            <thead class="d-sr-only">
              <tr>
                <th scope="col">{{ $t('profile.fieldColumn') }}</th>
                <th scope="col">{{ $t('profile.valueColumn') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(value, key) in entityData.entity.data"
                :key="key"
              >
                <template v-if="!hiddenFields.has(String(key))">
                  <th scope="row" class="font-weight-medium text-capitalize" style="width: 200px;">
                    {{ formatLabel(String(key)) }}
                  </th>
                  <td>{{ value ?? '-' }}</td>
                </template>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="my-4" />

          <p class="text-caption text-grey">
            {{ $t('profile.lastUpdated', { date: new Date(entityData.entity.lastUpdated).toLocaleDateString() }) }}
          </p>
        </v-card-text>
      </v-card>
    </LoadingState>
  </div>
</template>
