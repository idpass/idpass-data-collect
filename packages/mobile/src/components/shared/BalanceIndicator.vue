<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  allocated: number
  redeemed: number
  type: 'quantity' | 'monetary'
  currency?: string
  unitOfMeasure?: string
}>()

const remaining = computed(() => props.allocated - props.redeemed)

const percentage = computed(() =>
  props.allocated > 0 ? (remaining.value / props.allocated) * 100 : 0,
)

const thresholdClass = computed(() => {
  if (percentage.value > 50) return 'balance-indicator--green'
  if (percentage.value >= 25) return 'balance-indicator--yellow'
  return 'balance-indicator--red'
})

const barColor = computed(() => {
  if (percentage.value > 50) return '#22c55e'
  if (percentage.value >= 25) return '#f59e0b'
  return '#ef4444'
})

function formatAmount(value: number): string {
  if (props.type === 'monetary') {
    const symbol = props.currency ?? '$'
    return `${symbol}${value.toFixed(2)}`
  }
  const unit = props.unitOfMeasure ? ` ${props.unitOfMeasure}` : ''
  return `${value}${unit}`
}

const labelText = computed(() => {
  return `${formatAmount(remaining.value)} / ${formatAmount(props.allocated)} remaining`
})
</script>

<template>
  <div class="balance-indicator" :class="thresholdClass">
    <div class="balance-indicator__header">
      <span class="balance-indicator__icon">
        <!-- Green: checkmark (>50% remaining) -->
        <svg
          v-if="percentage > 50"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-label="Good balance"
          role="img"
        >
          <polyline
            points="2,8 6,12 14,4"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <!-- Yellow: warning triangle (25–50% remaining) -->
        <svg
          v-else-if="percentage >= 25"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-label="Low balance warning"
          role="img"
        >
          <polygon
            points="8,2 15,14 1,14"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <line
            x1="8"
            y1="6"
            x2="8"
            y2="10"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="8" cy="12.5" r="0.75" fill="currentColor" />
        </svg>
        <!-- Red: exclamation circle (<25% remaining) -->
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-label="Critical balance"
          role="img"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" />
          <line
            x1="8"
            y1="5"
            x2="8"
            y2="9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
        </svg>
      </span>
      <span class="balance-indicator__label">{{ labelText }}</span>
    </div>
    <div class="balance-indicator__track">
      <div
        class="balance-indicator__bar"
        :style="{ width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.balance-indicator {
  padding: 12px 16px;
  border-radius: 14px;
  background: white;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.balance-indicator--green {
  color: #15803d;
}

.balance-indicator--yellow {
  color: #92400e;
}

.balance-indicator--red {
  color: #b91c1c;
}

.balance-indicator__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.balance-indicator__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.balance-indicator__label {
  font-size: 14px;
  font-weight: 600;
}

.balance-indicator__track {
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.balance-indicator__bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
</style>
