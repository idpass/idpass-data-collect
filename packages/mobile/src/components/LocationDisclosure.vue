<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  acknowledged: []
}>()
</script>

<template>
  <div v-if="visible" class="location-disclosure-overlay" role="dialog" aria-modal="true" aria-labelledby="location-disclosure-title">
    <div class="location-disclosure">
      <div class="location-disclosure__icon">
        <svg viewBox="0 0 24 24" width="32" height="32" focusable="false" aria-hidden="true">
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"
            fill="currentColor"
          />
        </svg>
      </div>
      <h2 id="location-disclosure-title" class="location-disclosure__title">Location Access</h2>
      <p class="location-disclosure__text">
        This form captures your GPS location when opened. Your organization uses this to verify
        where data was collected.
      </p>
      <button class="location-disclosure__button" type="button" @click="emit('acknowledged')">
        Got it
      </button>
    </div>
  </div>
</template>

<style scoped>
.location-disclosure-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 1.5rem;
}

.location-disclosure {
  background: #ffffff;
  border-radius: 20px;
  padding: 2rem;
  max-width: 360px;
  width: 100%;
  text-align: center;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.location-disclosure__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0369a1;
  display: grid;
  place-items: center;
}

.location-disclosure__title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.location-disclosure__text {
  font-size: 0.95rem;
  color: #6b7280;
  line-height: 1.5;
  margin: 0;
}

.location-disclosure__button {
  width: 100%;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 0.5rem;
}
</style>
