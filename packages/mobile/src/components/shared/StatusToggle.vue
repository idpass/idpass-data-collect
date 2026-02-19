<script setup lang="ts">
import { ref } from 'vue'

type Status = 'present' | 'absent' | 'excused' | 'late'

const props = defineProps<{
  status: Status
}>()

const emit = defineEmits<{
  change: [status: string]
}>()

const isOpen = ref(false)

const statusOptions: { value: Status; label: string; color: string }[] = [
  { value: 'present', label: 'Present', color: '#22c55e' },
  { value: 'absent', label: 'Absent', color: '#ef4444' },
  { value: 'excused', label: 'Excused', color: '#2563eb' },
  { value: 'late', label: 'Late', color: '#f59e0b' },
]

function getStatusColor(status: Status): string {
  return statusOptions.find((o) => o.value === status)?.color ?? '#6b7280'
}

function getStatusLabel(status: Status): string {
  return statusOptions.find((o) => o.value === status)?.label ?? status
}

function selectStatus(status: Status) {
  emit('change', status)
  isOpen.value = false
}
</script>

<template>
  <div class="status-toggle">
    <button
      v-if="!isOpen"
      class="status-toggle__pill"
      :style="{ backgroundColor: getStatusColor(status) }"
      aria-haspopup="listbox"
      @click="isOpen = true"
    >
      {{ getStatusLabel(status) }}
    </button>
    <div v-else class="status-toggle__segmented" role="listbox">
      <button
        v-for="option in statusOptions"
        :key="option.value"
        class="status-toggle__option"
        :class="{ 'status-toggle__option--selected': option.value === status }"
        :style="
          option.value === status ? { backgroundColor: option.color, color: 'white' } : {}
        "
        role="option"
        :aria-selected="option.value === status"
        @click="selectStatus(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-toggle {
  display: inline-flex;
  align-items: center;
}

.status-toggle__pill {
  height: 48px;
  padding: 0 20px;
  border-radius: 999px;
  border: none;
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  min-width: 80px;
}

.status-toggle__segmented {
  display: flex;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.status-toggle__option {
  height: 48px;
  padding: 0 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: #374151;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.status-toggle__option:hover:not(.status-toggle__option--selected) {
  background-color: #e2e8f0;
}
</style>
