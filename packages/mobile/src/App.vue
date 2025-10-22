<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div id="app" class="app-shell safe-top safe-bottom">
    <main class="app-content disable-scrollbars">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, #f2f4f8 100%);
  color: var(--color-text);
}

.app-content {
  padding: 1.5rem 1rem 3.5rem;
  max-width: 480px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .app-content {
    padding: 2rem 0 4rem;
  }
}
</style>
