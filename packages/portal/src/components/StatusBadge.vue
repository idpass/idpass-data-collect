<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RequestStatus } from '@/types'

const props = defineProps<{
  status: RequestStatus
}>()

const { t } = useI18n()

interface StatusConfig {
  color: string
  icon: string
  label: string
}

const statusConfig = computed<StatusConfig>(() => {
  const configs: Record<RequestStatus, StatusConfig> = {
    draft: {
      color: 'grey',
      icon: 'mdi-file-outline',
      label: t('status.draft'),
    },
    pending: {
      color: 'blue',
      icon: 'mdi-clock-outline',
      label: t('status.pending'),
    },
    revision: {
      color: 'orange',
      icon: 'mdi-alert-circle-outline',
      label: t('status.revision'),
    },
    approved: {
      color: 'green',
      icon: 'mdi-check-circle-outline',
      label: t('status.approved'),
    },
    rejected: {
      color: 'red',
      icon: 'mdi-close-circle-outline',
      label: t('status.rejected'),
    },
    applied: {
      color: 'teal',
      icon: 'mdi-check-all',
      label: t('status.applied'),
    },
  }
  return configs[props.status]
})
</script>

<template>
  <v-chip
    :color="statusConfig.color"
    :prepend-icon="statusConfig.icon"
    size="small"
    variant="tonal"
    :data-testid="`status-badge-${status}`"
  >
    {{ statusConfig.label }}
  </v-chip>
</template>
