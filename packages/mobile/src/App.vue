<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import Claim169ScannerOverlay from '@/components/Claim169ScannerOverlay.vue'
import LockScreen from '@/components/LockScreen.vue'
import { AppLockService } from '@/services/AppLockService'

const { isOffline } = useNetworkStatus()

onMounted(async () => {
  await AppLockService.init()
})
</script>

<template>
  <div id="app" class="app-shell safe-top safe-bottom" @touchstart="AppLockService.resetInactivityTimer" @click="AppLockService.resetInactivityTimer">
    <LockScreen v-if="AppLockService.locked.value" />
    <div v-if="isOffline" class="offline-banner" role="alert">
      <svg class="offline-banner__icon" viewBox="0 0 24 24" focusable="false">
        <path
          d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"
          fill="currentColor"
        />
      </svg>
      <span class="offline-banner__text">Offline mode - Working locally. Sync will resume when connection is restored.</span>
    </div>
    <main class="app-content disable-scrollbars">
      <RouterView />
    </main>
    <Claim169ScannerOverlay />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--surface) 0%, var(--background) 100%);
  color: var(--text-main);
}

.app-content {
  padding: var(--spacing-lg) var(--spacing-md) var(--spacing-2xl);
  max-width: 480px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .app-content {
    padding: var(--spacing-xl) 0 var(--spacing-2xl);
  }
}

.offline-banner {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: linear-gradient(135deg, var(--status-warning-light) 0%, #fde68a 100%);
  border-bottom: 1px solid var(--status-warning);
  color: var(--status-warning);
  font-size: var(--font-size-sm);
  font-weight: 500;
  box-shadow: var(--shadow-subtle);
}

.offline-banner__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--status-warning);
}

.offline-banner__text {
  flex: 1;
  line-height: var(--line-height-normal);
}
</style>
