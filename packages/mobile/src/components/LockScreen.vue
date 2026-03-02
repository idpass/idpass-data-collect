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
      authError.value = 'Authentication cancelled. Tap Unlock to try again.'
    }
  } finally {
    isAuthenticating.value = false
  }
}
</script>

<template>
  <div class="lock-screen" role="dialog" aria-modal="true" aria-label="App locked">
    <div class="lock-screen__content">
      <div class="lock-screen__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="lock-screen__title">ID PASS DataCollect</h1>
      <p class="lock-screen__subtitle">Verify your identity to continue</p>
      <p v-if="authError" class="lock-screen__error" role="alert">{{ authError }}</p>
      <button
        class="lock-screen__unlock-btn"
        :disabled="isAuthenticating"
        @click="unlock"
      >
        {{ isAuthenticating ? 'Verifying...' : 'Unlock' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, #ffffff);
}

.lock-screen__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.lock-screen__logo svg {
  width: 64px;
  height: 64px;
  color: var(--primary, #1a56db);
}

.lock-screen__title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-main, #111827);
}

.lock-screen__subtitle {
  margin: 0;
  color: var(--text-secondary, #6b7280);
  font-size: 0.9rem;
}

.lock-screen__error {
  margin: 0;
  color: var(--status-error, #dc2626);
  font-size: 0.85rem;
}

.lock-screen__unlock-btn {
  margin-top: 0.5rem;
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 0.5rem;
  background: var(--primary, #1a56db);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.lock-screen__unlock-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
