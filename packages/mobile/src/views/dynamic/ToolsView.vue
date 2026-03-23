<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="tools">
    <header class="tools-header">
      <h1 class="tools-title">Tools</h1>
      <p class="tools-subtitle">Utilities and verification</p>
    </header>

    <div class="tools-grid">
      <!-- Claim-169 Identity Verification -->
      <article class="tool-card" @click="router.push({ name: 'claim169-hub' })">
        <div class="tool-card-icon tool-card-icon--identity">
          <v-icon size="28">mdi-shield-account-outline</v-icon>
        </div>
        <div class="tool-card-body">
          <h3 class="tool-card-name">Claim-169 Verification</h3>
          <p class="tool-card-desc">Scan and verify identity QR codes issued through MOSIP Inji</p>
        </div>
        <v-icon size="20" class="tool-card-chevron">mdi-chevron-right</v-icon>
      </article>
    </div>

    <p class="tools-footer">More tools coming soon</p>
  </div>
</template>

<style scoped>
.tools {
  display: flex;
  flex-direction: column;
  padding: 20px 16px 100px;
  gap: 16px;
}

.tools-header {
  padding: 4px 0 0;
}

.tools-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main, #1a202c);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.tools-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}

.tools-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tool-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.1s ease;
}

.tool-card:active {
  transform: scale(0.985);
  border-color: var(--border-default, #c4cdd5);
}

.tool-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-card-icon--identity {
  background: linear-gradient(135deg, rgba(44, 62, 80, 0.08), rgba(44, 62, 80, 0.15));
  color: var(--primary, #2c3e50);
}

.tool-card-body {
  flex: 1;
  min-width: 0;
}

.tool-card-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main, #1a202c);
  line-height: 1.3;
}

.tool-card-desc {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin-top: 3px;
  line-height: 1.4;
}

.tool-card-chevron {
  color: var(--text-muted, #64748b);
  opacity: 0.4;
  flex-shrink: 0;
}

.tools-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
  padding: 16px 0;
  opacity: 0.6;
}
</style>
