<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="d-flex align-items-center justify-content-center p-3">
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-12 col-md-6 col-lg-4">
          <template v-if="!route.query.code">
            <h4 class="text-center text-muted mb-4">
              <slot name="subtitle">Please choose your authentication method</slot>
            </h4>
          </template>
          <slot></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* All styling is handled by Bootstrap classes */
</style>
