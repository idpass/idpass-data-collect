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

let activeListener: { remove: () => Promise<void> } | null = null

const requestPermissions = async (): Promise<boolean> => {
  const { camera } = await Camera.requestPermissions()
  return camera === 'granted' || camera === 'limited'
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
  ScannerService.cancel()
}

// Computed header title: use active decoder label when scanning/decoding, otherwise generic title
const headerTitle = computed(() => {
  if (ScannerService.activeDecoder.value) {
    return ScannerService.activeDecoder.value.meta.label
  }
  return 'Scan Identity'
})

// Watch for transition into 'scanning' state to auto-start on mobile
watch(
  () => ScannerService.state.value,
  async (newState, oldState) => {
    if (newState === 'scanning' && oldState !== 'scanning') {
      ScannerService.lastError.value = ''
      if (isMobile.value) {
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
  <div v-if="ScannerService.state.value !== 'closed'" class="scanner-overlay">
    <div class="scanner-screen">
      <!-- Error banner driven by ScannerService.lastError -->
      <div v-if="ScannerService.lastError.value" class="error-banner">
        <svg class="error-icon" viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
        <span>{{ ScannerService.lastError.value }}</span>
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
              v-for="scannerConfig in ScannerService.availableDecoders.value"
              :key="scannerConfig.decoderId"
              class="picker-item"
              @click="ScannerService.selectDecoder(scannerConfig.decoderId)"
            >
              <div class="picker-item-icon">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path
                    :d="getDecoder(scannerConfig.decoderId)?.meta.icon ?? ''"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div class="picker-item-text">
                <span class="picker-item-label">{{
                  getDecoder(scannerConfig.decoderId)?.meta.label ?? scannerConfig.decoderId
                }}</span>
                <span
                  v-if="getDecoder(scannerConfig.decoderId)?.meta.description"
                  class="picker-item-description"
                >
                  {{ getDecoder(scannerConfig.decoderId)?.meta.description }}
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
          <button class="cancel-button" type="button" @click="handleClose">Cancel</button>

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
        <div v-else-if="ScannerService.state.value === 'decoding'" class="processing-overlay">
          <div class="spinner"></div>
          <p>Processing identity data...</p>
        </div>

      </div>

      <!-- Desktop notice for picker/decoding states -->
      <div
        v-if="!isMobile && ScannerService.state.value !== 'scanning'"
        class="desktop-notice"
      >
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
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: #f9fafb;
}

.scanner-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: #fee2e2;
  border-bottom: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.95rem;
}

.error-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: #dc2626;
}

.error-banner span {
  flex: 1;
}

.error-close {
  background: transparent;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: #991b1b;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 6px;
}

.error-close svg {
  width: 18px;
  height: 18px;
}

.scanner-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.back-button {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #374151;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.back-button:active {
  background: #f3f4f6;
}

.back-button svg {
  width: 24px;
  height: 24px;
}

.scanner-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
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
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

.picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #ffffff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
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
  background: #f3f4f6;
}

.picker-item-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.1);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.picker-item-icon svg {
  width: 26px;
  height: 26px;
  color: #2563eb;
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
  color: #1f2937;
}

.picker-item-description {
  font-size: 0.85rem;
  color: #6b7280;
  line-height: 1.4;
}

.picker-item-chevron {
  width: 20px;
  height: 20px;
  color: #9ca3af;
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
  border: 4px solid #2563eb;
}

.corner.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-radius: 8px 0 0 0;
}

.corner.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-radius: 0 8px 0 0;
}

.corner.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 8px;
}

.corner.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-radius: 0 0 8px 0;
}

.scan-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #2563eb, transparent);
  animation: scan 2s ease-in-out infinite;
}

@keyframes scan {
  0%, 100% {
    top: 10px;
  }
  50% {
    top: calc(100% - 10px);
  }
}

.scan-hint {
  color: white;
  font-size: 1rem;
  margin-top: 2rem;
}

.cancel-button {
  margin-top: 2rem;
  padding: 0.75rem 2rem;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
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
  border: 4px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.processing-overlay p {
  color: #6b7280;
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
  color: #f59e0b;
  margin-bottom: 1rem;
}

.desktop-notice p {
  color: #6b7280;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

/* Variant used inside the scanning overlay (dark background) */
.desktop-notice--scanning {
  position: absolute;
  bottom: 6rem;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 12px;
}

.desktop-notice--scanning p {
  color: rgba(255, 255, 255, 0.8);
}

.desktop-notice--scanning svg {
  color: #f59e0b;
}

.back-link {
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>
