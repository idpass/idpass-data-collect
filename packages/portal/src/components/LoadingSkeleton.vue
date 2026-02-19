<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

withDefaults(
  defineProps<{
    type?: string
    count?: number
  }>(),
  {
    type: 'card',
    count: 1,
  },
)
</script>

<template>
  <div aria-busy="true" :aria-label="t('common.loading')" role="status">
    <v-skeleton-loader
      v-for="index in count"
      :key="index"
      :type="type"
      class="mb-3"
    />
  </div>
</template>
