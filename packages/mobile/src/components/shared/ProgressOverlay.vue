<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  current: number
  total: number
  label?: string
}>()

const percentage = computed(() =>
  props.total > 0 ? Math.round((props.current / props.total) * 100) : 0,
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="progress-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div class="progress-overlay__card">
        <p v-if="label" class="progress-overlay__label">{{ label }}</p>
        <div class="progress-overlay__track">
          <div class="progress-overlay__bar" :style="{ width: `${percentage}%` }"></div>
        </div>
        <p class="progress-overlay__counter">{{ current }} / {{ total }}</p>
        <p class="progress-overlay__hint">Crash-safe: progress is saved</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.progress-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.progress-overlay__card {
  background: white;
  border-radius: 20px;
  padding: 32px 28px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  text-align: center;
}

.progress-overlay__label {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin: 0 0 16px;
}

.progress-overlay__track {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-overlay__bar {
  height: 100%;
  border-radius: 999px;
  background: #2563eb;
  transition: width 0.3s ease;
}

.progress-overlay__counter {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

.progress-overlay__hint {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}
</style>
