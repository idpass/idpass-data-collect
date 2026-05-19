<script setup lang="ts">
import { ref, watch } from 'vue'
import { decodeAndVerifyClaim169, registerIssuerKey } from '@/services/claim169Service'
import { Claim169ScannerService } from '@/services/Claim169ScannerService'
import { usePlatform } from '@/platform'
import { useBarcodeScan } from '@/composables/useBarcodeScan'
import type { VerifiedIdentity } from '@/services/claim169Service'

const { isNative } = usePlatform()
const { isScanning, requestPermissions, cleanup, scanBarcode } = useBarcodeScan()
const isProcessing = ref(false)
const errorMessage = ref('')
const showError = ref(false)
const webQrInput = ref('')
const isWebProcessing = ref(false)
// Holds the decoded VC pending the operator's confirmation. We stage it here
// rather than resolving the promise immediately so the agent sees WHO signed
// it, WHEN it expires, and whether it's still valid before they commit. Same
// pattern as a payment-confirmation screen — verify-decode-confirm-commit.
const pendingResult = ref<VerifiedIdentity | null>(null)

const formatDate = (epochSec?: number): string => {
  if (!epochSec) return '—'
  const d = new Date(epochSec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const issuerShort = (did?: string): string => {
  if (!did) return 'Unknown issuer'
  // did:web:demo-issuer.example.gov → demo-issuer.example.gov
  const m = /^did:[^:]+:(.+)$/.exec(did)
  return m ? m[1] : did
}

const confirmAndComplete = () => {
  if (!pendingResult.value) return
  if (pendingResult.value.isExpired) return
  if (!pendingResult.value.isVerified) return
  Claim169ScannerService.complete(pendingResult.value)
  pendingResult.value = null
}

const rejectAndRescan = () => {
  pendingResult.value = null
  if (isNative.value) {
    setTimeout(() => startScan(), 100)
  }
}

const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

const processQrContent = async (content: string): Promise<VerifiedIdentity> => {
  // Register trusted issuers passed via scan options (ensures they're available for verification)
  const trustedIssuers = Claim169ScannerService.options.value.trustedIssuers
  if (trustedIssuers && trustedIssuers.length > 0) {
    for (const issuer of trustedIssuers) {
      if (issuer.issuerId) {
        registerIssuerKey(issuer.issuerId, {
          ed25519: issuer.ed25519Key,
          es256: issuer.es256Key
        })
      }
    }
  }

  // Decode and verify the Claim-169 QR code
  // The service will try auto-verification against registered keys
  const result = await decodeAndVerifyClaim169(content)
  
  // Custom validation if provided
  if (Claim169ScannerService.options.value.validate) {
    const validationResult = await Claim169ScannerService.options.value.validate(result)
    if (validationResult !== true) {
      throw new Error(typeof validationResult === 'string' ? validationResult : 'Identity validation failed')
    }
  }

  return result
}

const handleWebSubmit = async () => {
  const raw = webQrInput.value.trim()
  if (!raw) return
  isWebProcessing.value = true
  try {
    const result = await processQrContent(raw)
    pendingResult.value = result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    displayError(`Invalid QR data: ${msg}`)
  } finally {
    isWebProcessing.value = false
  }
}

const startScan = async () => {
  try {
    if (!isNative.value) {
      return
    }

    const granted = await requestPermissions()
    if (!granted) {
      displayError('Camera permission is required to scan QR codes')
      return
    }

    const barcode = await scanBarcode()
    const content = barcode.rawValue || barcode.displayValue

    if (!content) {
      displayError('QR code did not contain any data')
      return
    }

    isProcessing.value = true

    try {
      const verifiedIdentity = await processQrContent(content)
      pendingResult.value = verifiedIdentity
      isProcessing.value = false
    } catch (decodeError) {
      const errorMsg = decodeError instanceof Error ? decodeError.message : String(decodeError)
      displayError(`Invalid QR code: ${errorMsg}`)
      
      // Don't close immediately on error, allow retrying
      isProcessing.value = false
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scan QR code'
    displayError(message)
    isProcessing.value = false
  }
}

const handleClose = async () => {
  await cleanup()
  Claim169ScannerService.cancel()
}

// Watch for service open state
watch(() => Claim169ScannerService.isOpen.value, async (isOpen) => {
  if (isOpen) {
    errorMessage.value = ''
    showError.value = false
    isProcessing.value = false
    pendingResult.value = null

    // Auto-start scanning if native
    if (isNative.value) {
      setTimeout(() => startScan(), 100)
    }
  } else {
    await cleanup()
    pendingResult.value = null
  }
})
</script>

<template>
  <div v-if="Claim169ScannerService.isOpen.value" class="scanner-overlay">
    <div class="scanner-screen">
      <!-- Error message -->
      <div v-if="showError" class="error-banner">
        <svg class="error-icon" viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
        <span>{{ errorMessage }}</span>
        <button class="error-close" type="button" @click="showError = false" aria-label="Close">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <!-- Header -->
      <header class="scanner-header">
        <button class="back-button" type="button" @click="handleClose" aria-label="Go back">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
        <h1>{{ Claim169ScannerService.options.value.title || 'Scan Identity QR' }}</h1>
      </header>

      <!-- Main content -->
      <div class="scanner-content">
        <!-- Confirmation panel: shows after a successful decode so the agent
             can see WHO signed the credential, WHEN it expires, and whether
             it's still valid before committing. Refusal here means no
             identity claim leaks into the form. -->
        <div v-if="pendingResult" class="confirm-panel">
          <div
            class="confirm-status"
            :class="{
              'confirm-status--ok': pendingResult.isVerified && !pendingResult.isExpired,
              'confirm-status--bad': !pendingResult.isVerified || pendingResult.isExpired,
            }"
          >
            <svg class="confirm-icon" viewBox="0 0 24 24" focusable="false">
              <path
                v-if="pendingResult.isVerified && !pendingResult.isExpired"
                d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                fill="currentColor"
              />
              <path
                v-else
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"
                fill="currentColor"
              />
            </svg>
            <div>
              <div class="confirm-status__title">
                <template v-if="!pendingResult.isVerified">Signature did not verify</template>
                <template v-else-if="pendingResult.isExpired">Credential expired</template>
                <template v-else>Identity verified offline</template>
              </div>
              <div class="confirm-status__subtitle">
                <template v-if="!pendingResult.isVerified">
                  No trusted issuer key matched this QR.
                </template>
                <template v-else-if="pendingResult.isExpired">
                  This credential is no longer valid.
                </template>
                <template v-else>
                  Signature checked against trusted issuer · no network used.
                </template>
              </div>
            </div>
          </div>

          <dl class="confirm-meta">
            <div class="confirm-meta__row">
              <dt>Subject</dt>
              <dd>{{ pendingResult.identity.fullName || pendingResult.identity.id || '—' }}</dd>
            </div>
            <div v-if="pendingResult.identity.dateOfBirth" class="confirm-meta__row">
              <dt>Date of birth</dt>
              <dd>{{ pendingResult.identity.dateOfBirth }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Subject ID</dt>
              <dd class="confirm-meta__mono">{{ pendingResult.identity.id || '—' }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Issuer</dt>
              <dd class="confirm-meta__mono">{{ issuerShort(pendingResult.cwt.issuer) }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Issued</dt>
              <dd>{{ formatDate(pendingResult.cwt.issuedAt) }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Expires</dt>
              <dd :class="{ 'confirm-meta__expired': pendingResult.isExpired }">
                {{ formatDate(pendingResult.cwt.expiresAt) }}
                <span v-if="pendingResult.isExpired"> · Expired</span>
              </dd>
            </div>
          </dl>

          <div class="confirm-actions">
            <button class="back-link" type="button" @click="rejectAndRescan">
              Scan again
            </button>
            <button
              class="scan-button"
              type="button"
              :disabled="!pendingResult.isVerified || pendingResult.isExpired"
              @click="confirmAndComplete"
            >
              Use this identity
            </button>
          </div>
        </div>

        <div v-else-if="isNative && !isScanning && !isProcessing" class="scanner-instructions">
          <div class="qr-icon">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M3 11h2v2H3v-2zm16-6h2v2h-2V5zm-8 6h2v2h-2v-2zm8 0h2v2h-2v-2zm-8 6h2v2h-2v-2zm-8 0h2v2H3v-2zm16 0h2v2h-2v-2zM3 5h2v2H3V5zm4 0h2v2H7V5zm0 12h2v2H7v-2zm0-6h2v2H7v-2zM5 7v4H3V7h2zm12 0v4h-2V7h2zm-8 0v4H7V7h2zm8 8v4h-2v-4h2zm-8 0v4H7v-4h2zm-4 0v4H3v-4h2zm16-8v4h-2V7h2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h2>{{ Claim169ScannerService.options.value.description || 'Scan a Claim-169 Identity QR Code' }}</h2>
          <p>Position the QR code within the camera frame to scan and verify the identity.</p>
          <button class="scan-button" type="button" @click="startScan">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM19 13v1.5h-1.5V13H19z"
                fill="currentColor"
              />
            </svg>
            Start Scanning
          </button>
        </div>

        <div v-else-if="isScanning" class="scanning-overlay barcode-scanner-modal">
          <div class="scan-frame">
            <div class="corner top-left"></div>
            <div class="corner top-right"></div>
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
            <div class="scan-line"></div>
          </div>
          <p class="scan-hint">Align QR code within frame</p>
          <button class="cancel-button" type="button" @click="handleClose">
            Cancel
          </button>
        </div>

        <div v-else-if="isProcessing" class="processing-overlay">
          <div class="spinner"></div>
          <p>Processing identity data...</p>
        </div>

        <!-- Web fallback: paste QR data -->
        <div v-else-if="!isNative" class="desktop-notice">
          <div class="qr-icon">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M3 11h2v2H3v-2zm16-6h2v2h-2V5zm-8 6h2v2h-2v-2zm8 0h2v2h-2v-2zm-8 6h2v2h-2v-2zm-8 0h2v2H3v-2zm16 0h2v2h-2v-2zM3 5h2v2H3V5zm4 0h2v2H7V5zm0 12h2v2H7v-2zm0-6h2v2H7v-2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <p>Paste raw Claim-169 QR data below to decode and verify.</p>
          <textarea
            v-model="webQrInput"
            rows="4"
            class="web-qr-input"
            placeholder="Paste QR payload here..."
          ></textarea>
          <button
            class="scan-button"
            type="button"
            :disabled="!webQrInput.trim() || isWebProcessing"
            @click="handleWebSubmit"
          >
            {{ isWebProcessing ? 'Processing...' : 'Decode' }}
          </button>
          <button class="back-link" type="button" @click="handleClose">
            Cancel
          </button>
        </div>
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

.scanner-instructions {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
}

/* Verify-decode-confirm-commit panel. Pattern from payment confirmations:
   show the operator the trust chain before they act on the data. */
.confirm-panel {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0.5rem 0.25rem;
}

.confirm-status {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
  padding: 1rem 1rem;
  border-radius: 14px;
}

.confirm-status--ok {
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
}

.confirm-status--bad {
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.confirm-icon {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  margin-top: 2px;
}

.confirm-status__title {
  font-weight: 700;
  font-size: 1.05rem;
}

.confirm-status__subtitle {
  font-size: 0.85rem;
  margin-top: 2px;
  color: inherit;
  opacity: 0.85;
}

.confirm-meta {
  display: grid;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  padding: 0.875rem 1rem;
  margin: 0;
}

.confirm-meta__row {
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.9rem;
}

.confirm-meta__row dt {
  color: #6b7280;
  font-weight: 500;
}

.confirm-meta__row dd {
  margin: 0;
  color: #111827;
  word-break: break-word;
}

.confirm-meta__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
}

.confirm-meta__expired {
  color: #b91c1c;
  font-weight: 600;
}

.confirm-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.confirm-actions .scan-button {
  flex: 1;
  justify-content: center;
}

.confirm-actions .scan-button:disabled {
  background: #d1d5db;
  cursor: not-allowed;
  opacity: 1;
}

.qr-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: rgba(59, 130, 246, 0.1);
  display: grid;
  place-items: center;
  margin-bottom: 1.5rem;
}

.qr-icon svg {
  width: 48px;
  height: 48px;
  color: #2563eb;
}

.scanner-instructions h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.75rem;
}

.scanner-instructions p {
  font-size: 0.95rem;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 2rem;
}

.scan-button {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.5rem;
  background: var(--brand, #ff6d37);
  color: #ffffff;
  border: none;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
}

.scan-button svg {
  width: 24px;
  height: 24px;
}

.scanning-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
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
  background: linear-gradient(90deg, transparent, var(--brand, #ff6d37), transparent);
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
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.cancel-button {
  margin-top: 2rem;
  padding: 0.75rem 2rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  font-size: 1rem;
  cursor: pointer;
}

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

.desktop-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
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

.back-link {
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.web-qr-input {
  width: 100%;
  font-size: 0.8rem;
  font-family: monospace;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  resize: vertical;
}
</style>
