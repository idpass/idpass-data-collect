<script setup lang="ts">
defineProps<{
  loading: boolean
  error?: string | null
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="d-flex justify-center align-center py-12">
    <v-progress-circular indeterminate color="primary" size="48" role="status" :aria-label="$t('common.loading')" />
  </div>
  <v-alert v-else-if="error" type="error" class="my-4">
    {{ error }}
    <template #append>
      <v-btn variant="text" size="small" @click="emit('retry')">{{ $t('common.retry') }}</v-btn>
    </template>
  </v-alert>
  <slot v-else />
</template>
