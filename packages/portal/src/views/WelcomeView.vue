<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

function handleGetStarted(): void {
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="portal-content">
    <v-card rounded="lg" elevation="2" class="pa-6">
      <v-card-text class="text-center">
        <v-icon
          size="72"
          color="primary"
          icon="mdi-account-check-outline"
          class="mb-4"
        />

        <h1 class="text-h5 font-weight-bold mb-4">
          {{ t('welcome.heading', { name: authStore.displayName }) }}
        </h1>

        <v-alert
          type="info"
          variant="tonal"
          rounded="lg"
          class="mb-4 text-left"
          icon="mdi-information-outline"
        >
          <p class="text-body-1 mb-2">
            {{ t('welcome.notLinkedExplanation') }}
          </p>
          <p class="text-body-2">
            {{ t('welcome.registrationGuidance') }}
          </p>
        </v-alert>

        <v-btn
          color="primary"
          size="large"
          block
          prepend-icon="mdi-arrow-right-circle-outline"
          class="mt-4"
          @click="handleGetStarted"
        >
          {{ t('welcome.getStarted') }}
        </v-btn>
      </v-card-text>
    </v-card>
  </div>
</template>
