<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PublicLayout from './layouts/PublicLayout.vue'
import PortalLayout from './layouts/PortalLayout.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'

const route = useRoute()
const layout = computed(() => {
  return route.meta.layout === 'public' ? PublicLayout : PortalLayout
})
</script>

<template>
  <ErrorBoundary>
    <component :is="layout">
      <router-view />
    </component>
  </ErrorBoundary>
</template>
