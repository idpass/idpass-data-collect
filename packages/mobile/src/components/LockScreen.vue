<!--
  Full-screen lock screen overlay.
  Shown when AppLockService.locked is true.
  Blocks all interaction with app content underneath.
-->
<script setup lang="ts">
import { ref } from 'vue'
import { AppLockService } from '@/services/AppLockService'

const isAuthenticating = ref(false)
const authError = ref<string | null>(null)

async function unlock() {
  if (isAuthenticating.value) return
  isAuthenticating.value = true
  authError.value = null
  try {
    const success = await AppLockService.authenticate()
    if (!success) {
      const snap = AppLockService._actor.getSnapshot()
      const machineError = (snap.context as { error?: string }).error
      authError.value = machineError || 'Authentication cancelled. Tap Unlock to try again.'
    }
  } finally {
    isAuthenticating.value = false
  }
}
</script>

<template>
  <div class="lock-screen" role="dialog" aria-modal="true" aria-label="App locked">
    <v-card elevation="0" width="320" class="text-center pa-6" rounded="xl">
      <v-icon size="64" color="primary" class="mb-4">mdi-lock-outline</v-icon>
      <h1 class="text-h5 font-weight-bold mb-2">ID PASS DataCollect</h1>
      <p class="text-body-2 text-medium-emphasis mb-4">Verify your identity to continue</p>
      <v-alert
        v-if="authError"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4 text-left"
        role="alert"
      >
        {{ authError }}
      </v-alert>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        min-width="160"
        :loading="isAuthenticating"
        :disabled="isAuthenticating"
        @click="unlock"
      >
        Unlock
      </v-btn>
    </v-card>
  </div>
</template>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, #ffffff);
}
</style>
