<script setup lang="ts">
defineProps<{
  guid: string
  type: string
  name?: string
  entityName?: string
  lastUpdated: string
}>()

defineEmits<{
  click: []
}>()

function typeIcon(type: string): string {
  if (type === 'group') return 'mdi-account-group'
  if (type === 'record') return 'mdi-clipboard-text-outline'
  return 'mdi-account'
}
</script>

<template>
  <v-card class="mb-3" variant="outlined" style="cursor: pointer" @click="$emit('click')">
    <v-card-title class="d-flex align-center">
      <v-icon
        :icon="typeIcon(type)"
        class="mr-2"
        size="small"
      />
      {{ name || guid.substring(0, 8) }}
      <v-spacer />
      <v-icon icon="mdi-chevron-right" size="small" color="grey" />
    </v-card-title>
    <v-card-subtitle>
      {{ entityName || type }} &middot; Updated {{ new Date(lastUpdated).toLocaleDateString() }}
    </v-card-subtitle>
  </v-card>
</template>
