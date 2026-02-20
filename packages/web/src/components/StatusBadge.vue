<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const color = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'warning'
    case 'approved':
      return 'success'
    case 'rejected':
      return 'error'
    default:
      return 'grey'
  }
})

const icon = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'mdi-clock-outline'
    case 'approved':
      return 'mdi-check-circle'
    case 'rejected':
      return 'mdi-close-circle'
    default:
      return 'mdi-help-circle'
  }
})
</script>

<template>
  <v-chip :color="color" size="small" variant="tonal">
    <v-icon :icon="icon" start size="small" />
    {{ status }}
  </v-chip>
</template>
