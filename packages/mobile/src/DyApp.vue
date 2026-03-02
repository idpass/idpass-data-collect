<!-- Root component for dynamic app -->

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import Claim169ScannerOverlay from '@/components/Claim169ScannerOverlay.vue'
import LockScreen from '@/components/LockScreen.vue'
import { AppLockService } from '@/services/AppLockService'

onMounted(async () => {
  await AppLockService.init()
})
</script>

<template>
  <div id="dy-app">
    <LockScreen v-if="AppLockService.locked.value" />
    <header>
      <nav class="safe-top navbar p-3 d-flex justify-content-center border-bottom align-items-center">
        <h5 class="m-0 bold title text-black">ID PASS DataCollect</h5>
      </nav>
    </header>
    <main>
      <div class="user-select-none disable-scrollbars">
        <RouterView />
      </div>
    </main>
    <Claim169ScannerOverlay />
  </div>
</template>

<style scoped>
main {
  padding: var(--spacing-md);
  background: var(--background);
}

header nav {
  background: var(--surface);
  border-bottom-color: var(--border-light);
}

header nav .title {
  color: var(--text-main);
  font-weight: 600;
}
</style>
