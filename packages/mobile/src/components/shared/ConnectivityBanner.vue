<script setup lang="ts">
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const props = defineProps<{
  lastSyncTime?: string
  servedCount?: number
  totalCount?: number
}>()

const { isOffline } = useNetworkStatus()
</script>

<template>
  <div class="connectivity-banner" :class="{ 'connectivity-banner--offline': isOffline }">
    <span
      class="connectivity-banner__dot"
      :class="{ 'connectivity-banner__dot--offline': isOffline }"
      aria-hidden="true"
    ></span>
    <span v-if="!isOffline" class="connectivity-banner__text">ONLINE — Connected</span>
    <span v-else class="connectivity-banner__text">
      OFFLINE — Last synced: {{ lastSyncTime ?? 'Never' }} — {{ servedCount ?? 0 }}/{{
        totalCount ?? 0
      }}
      served
    </span>
  </div>
</template>

<style scoped>
.connectivity-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 40;
  background-color: rgba(34, 197, 94, 0.12);
  border-bottom: 1px solid rgba(34, 197, 94, 0.3);
  color: #166534;
}

.connectivity-banner--offline {
  background-color: #d97706;
  border-bottom: 1px solid #b45309;
  color: white;
}

.connectivity-banner__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #22c55e;
  flex-shrink: 0;
}

.connectivity-banner__dot--offline {
  background-color: white;
}

.connectivity-banner__text {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
