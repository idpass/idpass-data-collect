<script setup lang="ts">
defineProps<{
  guid: string
  type: string
  name?: string
  lastUpdated: string
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <v-card class="mb-3" variant="outlined" @click="$emit('click')">
    <v-card-title class="d-flex align-center">
      <v-icon
        :icon="type === 'group' ? 'mdi-account-group' : 'mdi-account'"
        class="mr-2"
        size="small"
      />
      {{ name || guid }}
    </v-card-title>
    <v-card-subtitle>
      {{ type }} &middot; Updated {{ new Date(lastUpdated).toLocaleDateString() }}
    </v-card-subtitle>
  </v-card>
</template>
