<!--
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
-->

<script setup lang="ts">
import { ref } from 'vue'
import { Clipboard } from '@capacitor/clipboard'
import { useDatabase } from '@/database'
import { SecureStorageService } from '@/services/SecureStorageService'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useSyncService } from '@/store/syncService'
import { useErrorHandler } from '@/composables/useErrorHandler'

const isDevelop = import.meta.env.DEV && import.meta.env.VITE_DEVELOP === 'true'
const database = useDatabase()
const { isOffline } = useNetworkStatus()
const syncService = useSyncService()
const { handleAuthError } = useErrorHandler()

const appVersion = __APP_VERSION__
const errorExpanded = ref(false)
const errorCopied = ref(false)

const formatTime = (iso: string | null) => {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Never'
  return d.toLocaleString()
}

const copyErrorToClipboard = async () => {
  if (!syncService.lastSyncError) return
  await Clipboard.write({ string: syncService.lastSyncError })
  errorCopied.value = true
  setTimeout(() => { errorCopied.value = false }, 2000)
}

const onReLogin = async () => {
  await handleAuthError(syncService.currentAppId ?? undefined)
}

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

    <!-- Sync Queue section -->
    <section class="settings-section">
      <h2 class="settings-section-label">Sync Queue</h2>
      <div class="settings-card">
        <div class="settings-row">
          <span class="settings-row-label">Status</span>
          <span
            class="settings-row-value"
            :class="{
              'settings-row-value--ok': syncService.isSynced && !syncService.isSyncing,
              'settings-row-value--warn': syncService.isSyncing,
              'settings-row-value--danger': !!syncService.lastSyncError
            }"
          >
            {{ syncService.isSyncing ? 'Syncing...' : syncService.lastSyncError ? 'Error' : syncService.isSynced ? 'Up to date' : 'Pending' }}
          </span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-row-label">Pending events</span>
          <span class="settings-row-value settings-row-value--mono">{{ syncService.pendingCount }}</span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-row-label">Total entities</span>
          <span class="settings-row-value settings-row-value--mono">{{ syncService.totalEntities }}</span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-row-label">Last sync</span>
          <span class="settings-row-value">{{ formatTime(syncService.lastSyncTime) }}</span>
        </div>
        <template v-if="syncService.lastSyncError">
          <div class="settings-divider"></div>
          <div class="error-block">
            <button class="error-header" type="button" @click="errorExpanded = !errorExpanded">
              <span class="settings-row-label">Last error</span>
              <span class="error-toggle" :class="{ 'error-toggle--open': errorExpanded }">
                <span class="mdi mdi-chevron-down"></span>
              </span>
            </button>
            <div class="error-body" :class="{ 'error-body--open': errorExpanded }">
              <div class="error-preview" :class="{ 'error-preview--open': errorExpanded }">
                {{ syncService.lastSyncError }}
              </div>
              <div v-if="errorExpanded" class="error-actions">
                <button
                  class="error-copy-btn"
                  type="button"
                  @click.stop="copyErrorToClipboard"
                >
                  <span class="mdi" :class="errorCopied ? 'mdi-check' : 'mdi-content-copy'"></span>
                  {{ errorCopied ? 'Copied' : 'Copy error' }}
                </button>
                <button
                  v-if="syncService.currentAppId"
                  class="error-relogin-btn"
                  type="button"
                  @click.stop="onReLogin"
                >
                  <span class="mdi mdi-logout"></span>
                  Re-login
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- Sync History section -->
    <section v-if="syncService.syncHistory.length > 0" class="settings-section">
      <h2 class="settings-section-label">Sync History</h2>
      <div class="settings-card">
        <template v-for="(entry, index) in syncService.syncHistory" :key="index">
          <div v-if="index > 0" class="settings-divider"></div>
          <div class="settings-row">
            <div class="sync-history-entry">
              <span class="settings-row-label">{{ formatTime(entry.timestamp) }}</span>
              <span v-if="entry.error" class="settings-row-hint settings-row-value--danger">{{ entry.error }}</span>
            </div>
            <span
              class="settings-row-value"
              :class="entry.success ? 'settings-row-value--ok' : 'settings-row-value--danger'"
            >
              {{ entry.success ? 'OK' : 'Failed' }}
            </span>
          </div>
          <template v-if="isDevelop && entry.debug">
            <div class="settings-divider"></div>
            <div class="debug-detail">
              <div v-if="entry.debug.requestUrl" class="debug-row">
                <span class="debug-label">URL</span>
                <span class="debug-value">{{ entry.debug.requestUrl }}</span>
              </div>
              <div v-if="entry.debug.responseStatus" class="debug-row">
                <span class="debug-label">Status</span>
                <span class="debug-value">{{ entry.debug.responseStatus }}</span>
              </div>
              <div v-if="entry.debug.responseBody" class="debug-row">
                <span class="debug-label">Response</span>
                <pre class="debug-pre">{{ JSON.stringify(entry.debug.responseBody, null, 2) }}</pre>
              </div>
              <div v-if="entry.debug.requestPayload" class="debug-row">
                <span class="debug-label">Request</span>
                <pre class="debug-pre">{{ JSON.stringify(entry.debug.requestPayload, null, 2) }}</pre>
              </div>
              <div v-if="entry.debug.stack" class="debug-row">
                <span class="debug-label">Stack</span>
                <pre class="debug-pre">{{ entry.debug.stack }}</pre>
              </div>
            </div>
          </template>
        </template>
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
  border-radius: 12px;
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

.settings-row-value--danger {
  color: var(--status-danger, #e53e3e);
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

.error-block {
  display: flex;
  flex-direction: column;
}

.error-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  min-height: 48px;
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.error-header:active {
  background: var(--neutral-50, #f8f9fa);
}

.error-toggle {
  color: var(--text-muted, #64748b);
  font-size: 1.1rem;
  transition: transform 0.2s ease;
  display: flex;
}

.error-toggle--open {
  transform: rotate(180deg);
}

.error-body {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.25s ease;
}

.error-body--open {
  max-height: 500px;
}

.error-preview {
  padding: 0 16px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--status-danger, #e53e3e);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.error-preview--open {
  -webkit-line-clamp: unset;
  overflow: visible;
}

.error-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
}

.error-copy-btn,
.error-relogin-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.error-copy-btn {
  color: var(--status-danger, #e53e3e);
  background: color-mix(in srgb, var(--status-danger, #e53e3e) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--status-danger, #e53e3e) 20%, transparent);
}

.error-copy-btn:active {
  background: color-mix(in srgb, var(--status-danger, #e53e3e) 15%, transparent);
}

.error-relogin-btn {
  color: var(--text-main, #1a202c);
  background: var(--neutral-50, #f8f9fa);
  border: 1px solid var(--border-light, #dfe3e8);
}

.error-relogin-btn:active {
  background: var(--border-light, #dfe3e8);
}

.sync-history-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.debug-detail {
  padding: 8px 16px 12px;
  background: var(--neutral-50, #f8f9fa);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.debug-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.debug-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.debug-value {
  font-size: 0.75rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: var(--text-main, #1a202c);
  word-break: break-all;
}

.debug-pre {
  font-size: 0.7rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 6px;
  padding: 8px;
  margin: 0;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
