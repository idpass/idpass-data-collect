<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RequestHistoryEntry } from '@/types'
import StatusBadge from '@/components/StatusBadge.vue'

const { locale } = useI18n()

const props = defineProps<{
  history: RequestHistoryEntry[]
}>()

const sortedHistory = computed(() => {
  return [...props.history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
})

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <v-timeline
    side="end"
    density="compact"
    data-testid="status-timeline"
  >
    <v-timeline-item
      v-for="(entry, index) in sortedHistory"
      :key="index"
      dot-color="primary"
      size="small"
      :data-testid="`timeline-item-${index}`"
    >
      <div class="d-flex flex-column gap-1">
        <StatusBadge :status="entry.status" />
        <span class="text-caption text-medium-emphasis">
          {{ formatDate(entry.timestamp) }}
        </span>
        <p
          v-if="entry.message"
          class="text-body-2 mt-1"
          :data-testid="`timeline-message-${index}`"
        >
          {{ entry.message }}
        </p>
        <span
          v-if="entry.actor"
          class="text-caption text-medium-emphasis"
          :data-testid="`timeline-actor-${index}`"
        >
          {{ entry.actor }}
        </span>
      </div>
    </v-timeline-item>
  </v-timeline>
</template>
