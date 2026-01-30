<!-- Root component for dynamic app -->

<script setup lang="ts">
import { RouterView } from 'vue-router'
import Claim169ScannerOverlay from '@/components/Claim169ScannerOverlay.vue'
</script>

<template>
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
</template>

<style scoped>
main {
  padding: 1em;
}

/* header {
  display: flex;
  align-items: flex-end;
  border-bottom: 2px solid var(--color-medium-dark-blue);
  flex-direction: row;
  justify-content: space-between;
  padding: 1rem 0;
  padding-left: 24px;
} */
</style>
