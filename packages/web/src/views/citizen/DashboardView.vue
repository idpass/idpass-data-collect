<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSelfServiceEntity, type SelfServiceEntity } from '@/api/selfService'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const authStore = useAuthStore()
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
    error.value = err instanceof Error ? err.message : 'Failed to load your data'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function getDisplayName(): string {
  if (!entityData.value?.entity.data) return 'Citizen'
  const data = entityData.value.entity.data
  const name = data.firstName || data.name || data.fullName || ''
  return String(name) || 'Citizen'
}
</script>

<template>
  <div>
    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <div v-if="entityData">
        <h1 class="text-h4 mb-2">{{ $t('dashboard.welcome', { name: getDisplayName() }) }}</h1>
        <p class="text-body-1 text-grey mb-6">
          {{ $t('dashboard.manageProfile') }}
        </p>

        <v-row>
          <v-col cols="12" sm="6" md="4">
            <v-card
              variant="outlined"
              :to="`/citizen/${tenantId}/profile`"
              class="pa-4 text-center"
            >
              <v-icon icon="mdi-account" size="48" color="primary" class="mb-2" />
              <v-card-title>{{ $t('dashboard.myProfile') }}</v-card-title>
              <v-card-subtitle>{{ $t('dashboard.viewPersonalInfo') }}</v-card-subtitle>
            </v-card>
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-card
              variant="outlined"
              :to="`/citizen/${tenantId}/submissions`"
              class="pa-4 text-center"
            >
              <v-icon icon="mdi-history" size="48" color="primary" class="mb-2" />
              <v-card-title>{{ $t('dashboard.submissions') }}</v-card-title>
              <v-card-subtitle>{{ $t('dashboard.viewHistory') }}</v-card-subtitle>
            </v-card>
          </v-col>

          <v-col
            v-for="form in entityData.availableForms"
            :key="form.type"
            cols="12"
            sm="6"
            md="4"
          >
            <v-card
              variant="outlined"
              :to="`/citizen/${tenantId}/change-request/${form.type}`"
              class="pa-4 text-center"
            >
              <v-icon icon="mdi-file-edit" size="48" color="accent" class="mb-2" />
              <v-card-title>{{ form.label }}</v-card-title>
              <v-card-subtitle>{{ $t('dashboard.submitChangeRequest') }}</v-card-subtitle>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </LoadingState>
  </div>
</template>
