<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePlatform } from '@/platform'
import { useBarcodeScan } from '@/composables/useBarcodeScan'
import { useInjiConfig } from '@/composables/useInjiConfig'
import { useInjiVerification } from '@/composables/useInjiVerification'
import { verify, matchTemplate, VcRejectReason, type VerifiedVc } from '@/services/injiVcService'

const { isNative } = usePlatform()
const { isScanning, requestPermissions, cleanup, scanBarcode } = useBarcodeScan()
const injiConfig = useInjiConfig()
const session = useInjiVerification()

const isProcessing = ref(false)
const errorMessage = ref('')
const showError = ref(false)
const webInput = ref('')
const isWebProcessing = ref(false)
// Staged after a successful verify+template-match so the agent sees the issuer
// and claim before committing — same verify-decode-confirm-commit pattern as
// the Claim-169 overlay.
const pendingVc = ref<VerifiedVc | null>(null)
const overwritePaths = ref<string[] | null>(null)

const headerTitle = computed(() => session.currentTarget.value?.label ?? 'Verify with credential')

const REASON_MESSAGES: Record<VcRejectReason, string> = {
  [VcRejectReason.UNSUPPORTED_FORMAT]: 'Unsupported credential format. Expected a JWT-VC, SD-JWT, or JSON-LD (ldp_vc) credential.',
  [VcRejectReason.MALFORMED]: 'The credential could not be parsed.',
  [VcRejectReason.TOO_LARGE]: 'This credential is too large to store. It may embed a photo or biometrics.',
  [VcRejectReason.UNKNOWN_ISSUER]: 'Unknown issuer — not in this programme’s trust list.',
  [VcRejectReason.INVALID_SIGNATURE]: 'Signature did not verify against the trusted issuer key.',
  [VcRejectReason.EXPIRED]: 'This credential has expired.',
  [VcRejectReason.NOT_YET_VALID]: 'This credential is not valid yet.',
  [VcRejectReason.WRONG_TEMPLATE]: 'This credential type does not match the field’s expected credential.',
  [VcRejectReason.CLAIM_NOT_FOUND]: 'The expected claim was not found in this credential.'
}

const issuerShort = (did?: string): string => {
  if (!did) return 'Unknown issuer'
  const m = /^did:[^:]+:(.+)$/.exec(did)
  return m ? m[1] : did
}

const formatEpoch = (epochSec?: number): string => {
  if (!epochSec) return '—'
  const d = new Date(epochSec * 1000)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

const processRaw = async (raw: string): Promise<void> => {
  const target = session.currentTarget.value
  const res = await verify(raw, { trustedIssuers: injiConfig.value.trustedIssuers })
  if (!res.ok || !res.vc) {
    displayError(REASON_MESSAGES[res.reason ?? VcRejectReason.MALFORMED])
    return
  }
  // Enforce the field's declared template.
  const matched = matchTemplate(res.vc, injiConfig.value.credentialTemplates, target?.templateId)
  if (!matched) {
    displayError(REASON_MESSAGES[VcRejectReason.WRONG_TEMPLATE])
    return
  }
  pendingVc.value = res.vc
}

const handleWebSubmit = async () => {
  const raw = webInput.value.trim()
  if (!raw) return
  isWebProcessing.value = true
  try {
    await processRaw(raw)
  } catch (err) {
    displayError(`Could not verify: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    isWebProcessing.value = false
  }
}

const startScan = async () => {
  try {
    if (!isNative.value) return
    const granted = await requestPermissions()
    if (!granted) {
      displayError('Camera permission is required to scan credentials')
      return
    }
    const barcode = await scanBarcode()
    const content = barcode.rawValue || barcode.displayValue
    if (!content) {
      displayError('The code did not contain any data')
      return
    }
    isProcessing.value = true
    try {
      await processRaw(content)
    } finally {
      isProcessing.value = false
    }
  } catch (error) {
    displayError(error instanceof Error ? error.message : 'Failed to scan')
    isProcessing.value = false
  }
}

const commit = (overwriteConfirmed = false) => {
  if (!pendingVc.value) return
  const result = session.completeScan(pendingVc.value, { overwriteConfirmed })
  if (result.needsOverwriteConfirm?.length) {
    overwritePaths.value = result.needsOverwriteConfirm
    return
  }
  // completeScan resolved the promise + closed the overlay on success.
  pendingVc.value = null
  overwritePaths.value = null
}

const rescan = () => {
  pendingVc.value = null
  overwritePaths.value = null
  if (isNative.value) setTimeout(() => startScan(), 100)
}

const handleClose = async () => {
  await cleanup()
  session.cancelScan()
}

watch(
  () => session.isOpen.value,
  async (open) => {
    if (open) {
      errorMessage.value = ''
      showError.value = false
      isProcessing.value = false
      pendingVc.value = null
      overwritePaths.value = null
      webInput.value = ''
      if (isNative.value) setTimeout(() => startScan(), 100)
    } else {
      await cleanup()
      pendingVc.value = null
      overwritePaths.value = null
    }
  }
)
</script>

<template>
  <div v-if="session.isOpen.value" class="scanner-overlay">
    <div class="scanner-screen">
      <div v-if="showError" class="error-banner">
        <span>{{ errorMessage }}</span>
        <button class="error-close" type="button" @click="showError = false" aria-label="Close">✕</button>
      </div>

      <header class="scanner-header">
        <button class="back-button" type="button" @click="handleClose" aria-label="Go back">✕</button>
        <h1>{{ headerTitle }}</h1>
      </header>

      <div class="scanner-content">
        <!-- Overwrite confirmation -->
        <div v-if="overwritePaths" class="confirm-panel">
          <div class="confirm-status confirm-status--bad">
            <div>
              <div class="confirm-status__title">Overwrite existing verification?</div>
              <div class="confirm-status__subtitle">
                {{ overwritePaths.length }} field(s) were verified with a different credential.
              </div>
            </div>
          </div>
          <div class="confirm-actions">
            <button class="back-link" type="button" @click="rescan">Cancel</button>
            <button class="scan-button" type="button" @click="commit(true)">Overwrite</button>
          </div>
        </div>

        <!-- Verify-confirm panel -->
        <div v-else-if="pendingVc" class="confirm-panel">
          <div class="confirm-status confirm-status--ok">
            <div>
              <div class="confirm-status__title">Credential verified offline</div>
              <div class="confirm-status__subtitle">Signature checked against a trusted issuer.</div>
            </div>
          </div>
          <dl class="confirm-meta">
            <div class="confirm-meta__row">
              <dt>Issuer</dt>
              <dd class="confirm-meta__mono">{{ issuerShort(pendingVc.issuerDid) }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Type</dt>
              <dd>{{ pendingVc.types.join(', ') || '—' }}</dd>
            </div>
            <div class="confirm-meta__row">
              <dt>Expires</dt>
              <dd>{{ formatEpoch(pendingVc.expiresAt) }}</dd>
            </div>
          </dl>
          <div class="confirm-actions">
            <button class="back-link" type="button" @click="rescan">Scan again</button>
            <button class="scan-button" type="button" @click="commit(false)">Use credential</button>
          </div>
        </div>

        <!-- Native scan prompt -->
        <div v-else-if="isNative && !isScanning && !isProcessing" class="scanner-instructions">
          <h2>Scan the beneficiary's credential</h2>
          <p>Position the QR code within the camera frame to verify it offline.</p>
          <button class="scan-button" type="button" @click="startScan">Start Scanning</button>
        </div>

        <div v-else-if="isScanning" class="scanning-overlay">
          <p class="scan-hint">Align the QR code within the frame</p>
          <button class="cancel-button" type="button" @click="handleClose">Cancel</button>
        </div>

        <div v-else-if="isProcessing" class="processing-overlay">
          <div class="spinner"></div>
          <p>Verifying credential…</p>
        </div>

        <!-- Web fallback: paste -->
        <div v-else-if="!isNative" class="desktop-notice">
          <p>Paste the credential (JWT-VC or SD-JWT) below to verify it offline.</p>
          <textarea
            v-model="webInput"
            rows="4"
            class="web-input"
            placeholder="Paste credential here…"
          ></textarea>
          <button
            class="scan-button"
            type="button"
            :disabled="!webInput.trim() || isWebProcessing"
            @click="handleWebSubmit"
          >
            {{ isWebProcessing ? 'Verifying…' : 'Verify' }}
          </button>
          <button class="back-link" type="button" @click="handleClose">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #f9fafb;
}

.scanner-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
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

.error-banner span {
  flex: 1;
}

.error-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #991b1b;
  font-size: 1rem;
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
  cursor: pointer;
  color: #374151;
  font-size: 1.1rem;
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

.confirm-panel {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.confirm-status {
  display: flex;
  gap: 0.875rem;
  padding: 1rem;
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

.confirm-status__title {
  font-weight: 700;
  font-size: 1.05rem;
}

.confirm-status__subtitle {
  font-size: 0.85rem;
  margin-top: 2px;
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
  grid-template-columns: 80px 1fr;
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

.confirm-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.confirm-actions .scan-button {
  flex: 1;
  justify-content: center;
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
}

.scanning-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.scan-hint {
  color: #374151;
  font-size: 1rem;
}

.cancel-button {
  padding: 0.75rem 2rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
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
}

.desktop-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 360px;
}

.desktop-notice p {
  color: #6b7280;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

.web-input {
  width: 100%;
  font-size: 0.8rem;
  font-family: monospace;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  resize: vertical;
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
