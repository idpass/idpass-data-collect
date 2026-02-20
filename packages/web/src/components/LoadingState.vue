<script setup lang="ts">
defineProps<{
  loading: boolean
  error?: string | null
}>()
</script>

<template>
  <div v-if="loading" class="d-flex justify-center align-center py-12">
    <v-progress-circular indeterminate color="primary" size="48" />
  </div>
  <v-alert v-else-if="error" type="error" class="my-4">
    {{ error }}
  </v-alert>
  <slot v-else />
</template>
