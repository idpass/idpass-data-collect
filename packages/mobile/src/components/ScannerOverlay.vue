<script setup lang="ts">
/*
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
 */

import { ref, watch, onUnmounted, computed } from 'vue'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import type { Barcode } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { ScannerService } from '@/scanner/ScannerService'
import { getDecoder } from '@/scanner/ScannerRegistry'

const isMobile = ref(['android', 'ios'].includes(Capacitor.getPlatform()))
const isPermissionDenied = ref(false)

let activeListener: { remove: () => Promise<void> } | null = null

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
}

const openAppSettings = async () => {
  try {
    await BarcodeScanner.openSettings()
  } catch {
    // Fallback: just inform the user
    ScannerService.lastError.value =
      'Please open your device settings and grant camera permission to this app.'
  }
}

const cleanup = async () => {
  document.querySelector('body')?.classList.remove('barcode-scanner-active')
  await BarcodeScanner.stopScan().catch(() => {})
  if (activeListener) {
    await activeListener.remove().catch(() => {})
    activeListener = null
  }
}

const scanBarcode = (): Promise<Barcode> => {
  return new Promise((resolve, reject) => {
    document.querySelector('body')?.classList.add('barcode-scanner-active')

    BarcodeScanner.addListener('barcodeScanned', async (result) => {
      try {
        await cleanup()
        resolve(result.barcode)
      } catch (error) {
        reject(error)
      }
    })
      .then((listener) => {
        activeListener = listener
        void BarcodeScanner.startScan().catch(async (error) => {
          await cleanup()
          reject(error)
        })
      })
      .catch(async (error) => {
        await cleanup()
        reject(error)
      })
  })
}

const startScan = async () => {
  if (!isMobile.value) {
    return
  }

  try {
    const granted = await requestPermissions()
    if (!granted) {
      isPermissionDenied.value = true
      ScannerService.lastError.value = 'Camera permission is required to scan QR codes'
      return
    }

    const barcode = await scanBarcode()
    const content = barcode.rawValue || barcode.displayValue

    if (!content) {
      ScannerService.lastError.value = 'The scanned code did not contain any data'
      return
    }

    await ScannerService.handleRawCapture(content)
  } catch (error) {
    ScannerService.lastError.value =
      error instanceof Error ? error.message : 'Failed to scan QR code'
  }
}

const handleClose = async () => {
  await cleanup()
  isPermissionDenied.value = false
  ScannerService.cancel()
}

const handleBackToPicker = async () => {
  await cleanup()
  ScannerService.activeDecoder.value = null
  ScannerService.activeConfig.value = {}
  ScannerService.state.value = 'picker'
}

// Computed header title: use active decoder label when scanning/decoding, otherwise generic title
const headerTitle = computed(() => {
  if (ScannerService.activeDecoder.value) {
    return ScannerService.activeDecoder.value.meta.label
  }
  return 'Scan Identity'
})

// Pre-resolve decoder metadata for each available decoder to avoid repeated getDecoder() calls in the template
const resolvedDecoders = computed(() => {
  return ScannerService.availableDecoders.value.map((config) => {
    const decoder = getDecoder(config.decoderId)
    return {
      decoderId: config.decoderId,
      icon: decoder?.meta.icon ?? '',
      label: decoder?.meta.label ?? config.decoderId,
      description: decoder?.meta.description ?? ''
    }
  })
})

// Watch for transition into 'scanning' state to auto-start on mobile
watch(
  () => ScannerService.state.value,
  async (newState, oldState) => {
    if (newState === 'scanning' && oldState !== 'scanning') {
      ScannerService.lastError.value = ''
      if (isMobile.value) {
        // Delay camera start to allow the native WebView to render the scanning overlay.
        // Without this, the Capacitor barcode scanner native layer may activate before
        // the DOM has updated, causing a brief visual flash.
        setTimeout(() => startScan(), 100)
      }
    }

    if (newState === 'closed') {
      await cleanup()
    }
  }
)

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div
    v-if="ScannerService.state.value !== 'closed'"
    class="scanner-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Scanner"
  >
    <div class="scanner-screen">
      <!-- Error banner driven by ScannerService.lastError -->
      <div
        v-if="ScannerService.lastError.value"
        class="error-banner"
        aria-live="assertive"
        role="alert"
      >
        <svg class="error-icon" viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
        <span>{{ ScannerService.lastError.value }}</span>
        <button
          v-if="isPermissionDenied"
          class="open-settings-button"
          type="button"
          @click="openAppSettings"
        >
          Open Settings
        </button>
        <button
          class="error-close"
          type="button"
          aria-label="Close"
          @click="ScannerService.lastError.value = ''"
        >
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      <!-- Header with close button -->
      <header class="scanner-header">
        <button class="back-button" type="button" aria-label="Close scanner" @click="handleClose">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              fill="currentColor"
            />
          </svg>
        </button>
        <h1>{{ headerTitle }}</h1>
      </header>

      <!-- Main content area, rendered based on ScannerService.state -->
      <div class="scanner-content">
        <!-- picker state: bottom sheet listing available decoders -->
        <div v-if="ScannerService.state.value === 'picker'" class="picker-sheet">
          <p class="picker-heading">Choose a scanner type</p>
          <ul class="picker-list">
            <li
              v-for="resolved in resolvedDecoders"
              :key="resolved.decoderId"
              class="picker-item"
              role="button"
              tabindex="0"
              @click="ScannerService.selectDecoder(resolved.decoderId)"
              @keydown.enter="ScannerService.selectDecoder(resolved.decoderId)"
              @keydown.space.prevent="ScannerService.selectDecoder(resolved.decoderId)"
            >
              <div class="picker-item-icon">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path :d="resolved.icon" fill="currentColor" />
                </svg>
              </div>
              <div class="picker-item-text">
                <span class="picker-item-label">{{ resolved.label }}</span>
                <span v-if="resolved.description" class="picker-item-description">
                  {{ resolved.description }}
                </span>
              </div>
              <svg class="picker-item-chevron" viewBox="0 0 24 24" focusable="false">
                <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor" />
              </svg>
            </li>
          </ul>
        </div>

        <!-- scanning state: camera viewfinder with scan frame and cancel -->
        <div v-else-if="ScannerService.state.value === 'scanning'" class="scanning-overlay">
          <div class="scan-frame">
            <div class="corner top-left"></div>
            <div class="corner top-right"></div>
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
            <div class="scan-line"></div>
          </div>
          <p class="scan-hint">Align QR code within frame</p>
          <div class="scanning-actions">
            <button
              v-if="ScannerService.availableDecoders.value.length > 1"
              class="cancel-button"
              type="button"
              @click="handleBackToPicker"
            >
              Back
            </button>
            <button class="cancel-button" type="button" @click="handleClose">Cancel</button>
          </div>

          <!-- Desktop notice shown when not on mobile -->
          <div v-if="!isMobile" class="desktop-notice desktop-notice--scanning">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"
                fill="currentColor"
              />
            </svg>
            <p>QR scanning requires a mobile device with a camera.</p>
          </div>
        </div>

        <!-- decoding state: processing spinner -->
        <div
          v-else-if="ScannerService.state.value === 'decoding'"
          class="processing-overlay"
          role="status"
          aria-live="polite"
        >
          <div class="spinner"></div>
          <p>Processing identity data...</p>
        </div>
      </div>

      <!-- Desktop notice for picker/decoding states -->
      <div v-if="!isMobile && ScannerService.state.value !== 'scanning'" class="desktop-notice">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"
            fill="currentColor"
          />
        </svg>
        <p>QR scanning requires a mobile device with a camera.</p>
        <button class="back-link" type="button" @click="handleClose">Close Scanner</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--background);
}

.scanner-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--status-danger-light);
  border-bottom: 1px solid #fecaca;
  color: var(--status-danger-dark);
  font-size: 0.95rem;
}

.error-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--status-danger);
}

.error-banner span {
  flex: 1;
}

.error-close {
  background: transparent;
  border: none;
  min-width: 44px;
  min-height: 44px;
  padding: 0.5rem;
  cursor: pointer;
  color: var(--status-danger-dark);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 6px;
}

.error-close svg {
  width: 18px;
  height: 18px;
}

.open-settings-button {
  background: transparent;
  border: 1px solid var(--status-danger-dark);
  color: var(--status-danger-dark);
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}

.scanner-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  padding-top: max(1rem, env(safe-area-inset-top));
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}

.back-button {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: var(--neutral-500);
  display: grid;
  place-items: center;
  border-radius: var(--radius-lg);
}

.back-button:active {
  background: var(--neutral-50);
}

.back-button svg {
  width: 24px;
  height: 24px;
}

.scanner-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
}

.scanner-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* --- Picker --- */

.picker-sheet {
  width: 100%;
  max-width: 480px;
}

.picker-heading {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

.picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: var(--surface);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-subtle);
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  transition: background 0.1s ease;
}

.picker-item:last-child {
  border-bottom: none;
}

.picker-item:active {
  background: var(--neutral-50);
}

.picker-item-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-xl);
  background: rgba(59, 130, 246, 0.1);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.picker-item-icon svg {
  width: 26px;
  height: 26px;
  color: var(--status-info-dark);
}

.picker-item-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.picker-item-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
}

.picker-item-description {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.picker-item-chevron {
  width: 20px;
  height: 20px;
  color: var(--neutral-300);
  flex-shrink: 0;
}

/* --- Scanning --- */

.scanning-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  z-index: 100;
}

.scan-frame {
  position: relative;
  width: 280px;
  height: 280px;
}

.corner {
  position: absolute;
  width: 40px;
  height: 40px;
  border: 4px solid var(--status-info-dark);
}

.corner.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-radius: var(--radius-lg) 0 0 0;
}

.corner.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-radius: 0 var(--radius-lg) 0 0;
}

.corner.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 var(--radius-lg);
}

.corner.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-radius: 0 0 var(--radius-lg) 0;
}

.scan-line {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--status-info-dark), transparent);
  animation: scan 2s ease-in-out infinite;
  will-change: transform;
}

@keyframes scan {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(260px);
  }
}

.scan-hint {
  color: white;
  font-size: 1rem;
  margin-top: 2rem;
}

.scanning-actions {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  margin-top: 2rem;
}

.cancel-button {
  padding: 0.75rem 2rem;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-xl);
  font-size: 1rem;
  cursor: pointer;
}

/* --- Decoding / processing --- */

.processing-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--neutral-100);
  border-top-color: var(--status-info-dark);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.processing-overlay p {
  color: var(--text-muted);
  font-size: 1rem;
}

/* --- Desktop notice --- */

.desktop-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
  padding: 2rem;
}

.desktop-notice svg {
  width: 48px;
  height: 48px;
  color: var(--status-warning);
  margin-bottom: 1rem;
}

.desktop-notice p {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

/* Variant used inside the scanning overlay (dark background) */
.desktop-notice--scanning {
  position: absolute;
  bottom: 6rem;
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-xl);
}

.desktop-notice--scanning p {
  color: rgba(255, 255, 255, 0.8);
}

.desktop-notice--scanning svg {
  color: var(--status-warning);
}

.back-link {
  background: transparent;
  border: none;
  color: var(--status-info-dark);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>
