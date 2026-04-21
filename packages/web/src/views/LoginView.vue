<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'

const authStore = useAuthStore()
const router = useRouter()

onMounted(() => {
  if (authStore.isAuthenticated) {
    if (authStore.isAgent) {
      router.push('/agent/login')
    } else if (authStore.isCitizen && authStore.citizenPayload?.tenantId) {
      router.push(`/citizen/${authStore.citizenPayload.tenantId}`)
    }
  }
})
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6 text-center" elevation="2">
          <v-card-title class="text-h4 mb-4">ID PASS DataCollect</v-card-title>
          <v-card-subtitle class="mb-6">Choose how you want to access the system</v-card-subtitle>

          <v-card-text>
            <v-btn
              color="primary"
              size="large"
              block
              class="mb-4"
              prepend-icon="mdi-briefcase"
              to="/agent/login"
            >
              Agent Login
            </v-btn>

            <v-btn
              color="accent"
              size="large"
              block
              prepend-icon="mdi-account"
              to="/citizen/login"
            >
              Citizen Portal
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
