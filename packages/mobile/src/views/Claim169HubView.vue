<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePlatform } from '@/platform'

const router = useRouter()
const { isNative } = usePlatform()
</script>

<template>
  <div class="hub">
    <div class="hub-nav">
      <span class="hub-nav-title">Claim-169</span>
    </div>

    <!-- Hero -->
    <div class="hub-hero">
      <div class="hub-hero-icon">
        <svg viewBox="0 0 64 64" fill="none" class="hero-shield">
          <path d="M32 4L8 16v16c0 14.4 10.24 27.84 24 32 13.76-4.16 24-17.6 24-32V16L32 4z"
            fill="var(--primary, #2c3e50)" opacity="0.08" />
          <path d="M32 4L8 16v16c0 14.4 10.24 27.84 24 32 13.76-4.16 24-17.6 24-32V16L32 4z"
            stroke="var(--primary, #2c3e50)" stroke-width="2" fill="none" opacity="0.3" />
          <circle cx="32" cy="26" r="7" stroke="var(--primary, #2c3e50)" stroke-width="2" fill="none" />
          <path d="M22 42c0-5.52 4.48-10 10-10s10 4.48 10 10" stroke="var(--primary, #2c3e50)" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
      </div>
      <h1 class="hub-hero-title">Identity Verification</h1>
      <p class="hub-hero-desc">
        Scan and verify Claim-169 identity QR codes issued through MOSIP Inji digital wallets.
      </p>
    </div>

    <!-- Actions -->
    <div class="hub-actions">
      <button class="hub-action hub-action--primary" type="button" @click="router.push({ name: 'scan-claim169' })">
        <div class="hub-action-icon">
          <v-icon size="24">mdi-qrcode-scan</v-icon>
        </div>
        <div class="hub-action-body">
          <span class="hub-action-title">Scan Identity QR</span>
          <span class="hub-action-desc">
            {{ isNative ? 'Use camera to scan a QR code' : 'Paste QR payload to decode' }}
          </span>
        </div>
        <v-icon size="20" class="hub-action-arrow">mdi-arrow-right</v-icon>
      </button>
    </div>

    <!-- Info -->
    <div class="hub-info">
      <div class="hub-info-item">
        <v-icon size="18" color="success">mdi-check-decagram</v-icon>
        <span>Cryptographic signature verification</span>
      </div>
      <div class="hub-info-item">
        <v-icon size="18" color="info">mdi-cloud-off-outline</v-icon>
        <span>Works fully offline</span>
      </div>
      <div class="hub-info-item">
        <v-icon size="18" color="secondary">mdi-content-save-outline</v-icon>
        <span>Save verified identities to collection programs</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hub {
  display: flex;
  flex-direction: column;
  padding: 0 16px 40px;
  gap: 20px;
}

.hub-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.hub-back {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border-light, #dfe3e8);
  background: var(--surface, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-main, #1a202c);
  transition: background 0.15s ease;
}

.hub-back:active {
  background: var(--neutral-50, #f8f9fa);
}

.hub-nav-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Hero */
.hub-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 0 8px;
}

.hub-hero-icon {
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
}

.hero-shield {
  width: 100%;
  height: 100%;
}

.hub-hero-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-main, #1a202c);
  letter-spacing: -0.02em;
}

.hub-hero-desc {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  line-height: 1.5;
  margin-top: 8px;
  max-width: 300px;
}

/* Actions */
.hub-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hub-action {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: transform 0.1s ease;
}

.hub-action:active {
  transform: scale(0.985);
}

.hub-action--primary {
  background: var(--primary, #2c3e50);
  color: #fff;
}

.hub-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hub-action-body {
  flex: 1;
  min-width: 0;
}

.hub-action-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
}

.hub-action-desc {
  display: block;
  font-size: 0.8rem;
  opacity: 0.7;
  margin-top: 2px;
}

.hub-action-arrow {
  opacity: 0.5;
  flex-shrink: 0;
}

/* Info */
.hub-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 12px;
}

.hub-info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.825rem;
  color: var(--text-main, #1a202c);
}
</style>
