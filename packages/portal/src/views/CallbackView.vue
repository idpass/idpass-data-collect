<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const hasError = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  try {
    await authStore.handleCallback()
    // For Phase 1, redirect to dashboard after successful auth
    router.push({ name: 'dashboard' })
  } catch (err) {
    hasError.value = true
    errorMessage.value = err instanceof Error ? err.message : t('callback.errorMessage')
  }
})

function handleTryAgain(): void {
  router.push({ name: 'login' })
}
</script>

<template>
  <v-card rounded="lg" elevation="4" class="pa-8 text-center">
    <v-card-text>
      <template v-if="!hasError">
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
          class="mb-6"
        />
        <p class="text-h6 text-medium-emphasis">
          {{ t('callback.processing') }}
        </p>
      </template>

      <template v-else>
        <v-icon size="64" color="error" icon="mdi-alert-circle-outline" class="mb-4" />

        <h1 class="text-h6 font-weight-bold mb-3">
          {{ t('errors.generic') }}
        </h1>

        <p class="text-body-1 text-medium-emphasis mb-6">
          {{ errorMessage || t('callback.errorMessage') }}
        </p>

        <v-btn
          color="primary"
          size="large"
          block
          prepend-icon="mdi-refresh"
          @click="handleTryAgain"
        >
          {{ t('callback.tryAgain') }}
        </v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>
