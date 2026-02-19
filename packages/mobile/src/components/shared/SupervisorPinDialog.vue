<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRedemptionStore } from '@/store/redemption'
import type { SupervisorPin } from '@/store/redemption'

const props = defineProps<{
  visible: boolean
  title?: string
  supervisorPins: SupervisorPin[]
}>()

const emit = defineEmits<{
  verified: [supervisorId: string]
  cancel: []
}>()

const redemptionStore = useRedemptionStore()

const pin = ref('')
const shake = ref(false)
const lockCountdown = ref(0)
const errorMessage = ref('')

let countdownInterval: ReturnType<typeof setInterval> | null = null

// Lockout state is owned by the store so it persists across dialog close/reopen.
const isLocked = computed((): boolean => {
  if (!redemptionStore.pinLockoutUntil) return false
  return Date.now() < new Date(redemptionStore.pinLockoutUntil).getTime()
})

function updateCountdown() {
  if (redemptionStore.pinLockoutUntil) {
    const lockoutTime = new Date(redemptionStore.pinLockoutUntil).getTime()
    lockCountdown.value = Math.max(0, Math.ceil((lockoutTime - Date.now()) / 1000))
  } else {
    lockCountdown.value = 0
  }
}

function startCountdownTimer() {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
  updateCountdown()
  countdownInterval = setInterval(() => {
    updateCountdown()
    if (!isLocked.value) {
      clearInterval(countdownInterval!)
      countdownInterval = null
    }
  }, 1000)
}

function pressDigit(digit: string) {
  if (isLocked.value || pin.value.length >= 4) return
  pin.value += digit
}

function pressBackspace() {
  if (isLocked.value) return
  pin.value = pin.value.slice(0, -1)
}

async function pressConfirm() {
  if (isLocked.value || pin.value.length !== 4) return

  const result = await redemptionStore.verifyPin(pin.value, props.supervisorPins)

  if (result.verified && result.supervisorId) {
    pin.value = ''
    errorMessage.value = ''
    emit('verified', result.supervisorId)
    return
  }

  pin.value = ''

  if (isLocked.value) {
    // Store triggered lockout on this attempt
    errorMessage.value = 'Too many attempts. Locked for 30s.'
    startCountdownTimer()
  } else {
    errorMessage.value = `Wrong PIN (${redemptionStore.pinAttempts}/${3})`
    shake.value = true
    setTimeout(() => {
      shake.value = false
    }, 500)
  }
}

function handleCancel() {
  // Only clear UI state — lockout counter in store is intentionally preserved
  pin.value = ''
  errorMessage.value = ''
  emit('cancel')
}

function resetUiState() {
  // Clear only the visual/input state; lockout state lives in the store
  pin.value = ''
  errorMessage.value = ''
  shake.value = false
  if (countdownInterval !== null) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      resetUiState()
    } else {
      // When the dialog opens, sync countdown display if store has active lockout
      if (isLocked.value) {
        startCountdownTimer()
      }
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="pin-dialog" role="dialog" aria-modal="true">
      <div class="pin-dialog__backdrop" @click="handleCancel"></div>
      <div class="pin-dialog__sheet" :class="{ 'pin-dialog__sheet--shake': shake }">
        <div class="pin-dialog__handle"></div>
        <h2 class="pin-dialog__title">{{ title ?? 'Supervisor Authorization' }}</h2>

        <div class="pin-dialog__dots" aria-label="PIN input">
          <span
            v-for="i in 4"
            :key="i"
            class="pin-dialog__dot"
            :class="{ 'pin-dialog__dot--filled': pin.length >= i }"
          ></span>
        </div>

        <p v-if="errorMessage" class="pin-dialog__error" role="alert">{{ errorMessage }}</p>
        <p v-if="isLocked" class="pin-dialog__lockout">Locked — {{ lockCountdown }}s remaining</p>

        <div class="pin-dialog__keypad">
          <button
            v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
            :key="digit"
            class="pin-dialog__key"
            :disabled="isLocked"
            @click="pressDigit(digit)"
          >
            {{ digit }}
          </button>
          <button
            class="pin-dialog__key pin-dialog__key--action"
            :disabled="isLocked"
            @click="pressBackspace"
          >
            ⌫
          </button>
          <button
            class="pin-dialog__key"
            :disabled="isLocked"
            @click="pressDigit('0')"
          >
            0
          </button>
          <button
            class="pin-dialog__key pin-dialog__key--confirm"
            :disabled="isLocked || pin.length !== 4"
            @click="pressConfirm"
          >
            ✓
          </button>
        </div>

        <button class="pin-dialog__cancel" @click="handleCancel">Cancel</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pin-dialog {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.pin-dialog__backdrop {
  flex: 1;
  background: rgba(15, 23, 42, 0.5);
}

.pin-dialog__sheet {
  background: white;
  border-radius: 20px 20px 0 0;
  padding: 12px 24px 40px;
  box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.12);
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px);
  }
  40% {
    transform: translateX(8px);
  }
  60% {
    transform: translateX(-8px);
  }
  80% {
    transform: translateX(8px);
  }
}

.pin-dialog__sheet--shake {
  animation: shake 0.5s ease;
}

.pin-dialog__handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  margin: 0 auto 20px;
}

.pin-dialog__title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  text-align: center;
  margin: 0 0 24px;
}

.pin-dialog__dots {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.pin-dialog__dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: transparent;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.pin-dialog__dot--filled {
  background: #0f172a;
  border-color: #0f172a;
}

.pin-dialog__error {
  text-align: center;
  color: #ef4444;
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
}

.pin-dialog__lockout {
  text-align: center;
  color: #f59e0b;
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 8px;
}

.pin-dialog__keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.pin-dialog__key {
  height: 56px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  transition: background-color 0.1s;
}

.pin-dialog__key:hover:not(:disabled) {
  background: #e2e8f0;
}

.pin-dialog__key:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pin-dialog__key--action {
  background: #fee2e2;
  color: #ef4444;
  border-color: #fecaca;
}

.pin-dialog__key--confirm {
  background: #dcfce7;
  color: #15803d;
  border-color: #bbf7d0;
}

.pin-dialog__key--confirm:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  border-color: #e2e8f0;
}

.pin-dialog__cancel {
  width: 100%;
  height: 48px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
</style>
