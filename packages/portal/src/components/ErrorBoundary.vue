<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()

const hasError = ref(false)

onErrorCaptured((error) => {
  console.error('[ErrorBoundary] Caught component error:', error)
  hasError.value = true
  // Return false to stop the error from propagating further
  return false
})

function handleRefresh(): void {
  window.location.reload()
}

function handleGoHome(): void {
  router.push('/')
}
</script>

<template>
  <div v-if="hasError" data-testid="error-boundary-screen" class="error-boundary-screen">
    <v-container class="d-flex align-center justify-center" style="min-height: 100vh">
      <v-card class="text-center pa-8" max-width="480" elevation="0">
        <v-icon color="error" size="72" class="mb-6">mdi-alert-circle-outline</v-icon>

        <v-card-title>
          <h1 class="text-h5 font-weight-bold mb-4">
            {{ t('errors.boundary.heading') }}
          </h1>
        </v-card-title>

        <v-card-text class="text-body-1 text-medium-emphasis mb-6">
          {{ t('errors.boundary.description') }}
        </v-card-text>

        <v-card-actions class="justify-center flex-column ga-3">
          <v-btn
            color="primary"
            variant="elevated"
            size="large"
            data-testid="refresh-page-btn"
            @click="handleRefresh"
          >
            {{ t('errors.boundary.refresh') }}
          </v-btn>
          <v-btn
            variant="text"
            size="large"
            data-testid="go-home-btn"
            @click="handleGoHome"
          >
            {{ t('errors.boundary.goHome') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-container>
  </div>
  <slot v-else />
</template>
