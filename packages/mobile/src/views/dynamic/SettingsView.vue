<script setup lang="ts">
import { useDatabase } from '@/database'
import { SecureStorageService } from '@/services/SecureStorageService'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const isDevelop = import.meta.env.VITE_DEVELOP === 'true'
const database = useDatabase()
const { isOffline } = useNetworkStatus()

const appVersion = '2.0.0-beta.1'

const devHandleClickClearData = async () => {
  await database.tenantapps.remove()
  localStorage.clear()
  sessionStorage.clear()
  await SecureStorageService.clear()
  window.location.reload()
}
</script>

<template>
  <div class="settings">
    <header class="settings-header">
      <h1 class="settings-title">Settings</h1>
    </header>

    <!-- About section -->
    <section class="settings-section">
      <h2 class="settings-section-label">About</h2>
      <div class="settings-card">
        <div class="settings-row">
          <span class="settings-row-label">Application</span>
          <span class="settings-row-value">ID PASS DataCollect</span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-row-label">Version</span>
          <span class="settings-row-value settings-row-value--mono">{{ appVersion }}</span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-row-label">Network</span>
          <span class="settings-row-value" :class="isOffline ? 'settings-row-value--warn' : 'settings-row-value--ok'">
            {{ isOffline ? 'Offline' : 'Online' }}
          </span>
        </div>
      </div>
    </section>

    <!-- Developer section -->
    <section v-if="isDevelop" class="settings-section">
      <h2 class="settings-section-label">Developer</h2>
      <div class="settings-card">
        <button class="settings-row settings-row--action settings-row--danger" type="button" @click="devHandleClickClearData">
          <span class="settings-row-label">Clear all data</span>
          <span class="settings-row-hint">Removes all programs, records, and local storage</span>
        </button>
      </div>
    </section>

    <p class="settings-footer">
      Licensed under Apache 2.0
    </p>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  padding: 20px 16px 100px;
  gap: 24px;
}

.settings-header {
  padding: 4px 0 0;
}

.settings-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main, #1a202c);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 4px;
}

.settings-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border-light, #dfe3e8);
  border-radius: 14px;
  overflow: hidden;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  min-height: 48px;
}

.settings-row--action {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  transition: background 0.15s ease;
}

.settings-row--action:active {
  background: var(--neutral-50, #f8f9fa);
}

.settings-row--danger .settings-row-label {
  color: var(--status-danger, #e53e3e);
  font-weight: 600;
}

.settings-row-label {
  font-size: 0.875rem;
  color: var(--text-main, #1a202c);
}

.settings-row-value {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
}

.settings-row-value--mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8rem;
}

.settings-row-value--ok {
  color: var(--status-success, #2d8a56);
  font-weight: 600;
}

.settings-row-value--warn {
  color: var(--status-warning, #d97706);
  font-weight: 600;
}

.settings-row-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
}

.settings-divider {
  height: 1px;
  background: var(--border-light, #dfe3e8);
  margin: 0 16px;
}

.settings-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
  padding: 8px 0;
  opacity: 0.5;
}
</style>
