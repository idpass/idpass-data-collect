<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { decodeAndVerifyClaim169 } from '@/services/claim169Service'
import { usePlatform } from '@/platform'
import { useBarcodeScan } from '@/composables/useBarcodeScan'
import { useSnackbar } from '@/composables/useSnackbar'
import type { VerifiedIdentity } from '@/services/claim169Service'

const router = useRouter()
const { isNative } = usePlatform()
const { isScanning, requestPermissions, cleanup, scanBarcode } = useBarcodeScan()
const { showError } = useSnackbar()

const isProcessing = ref(false)
const webQrInput = ref('')
const isWebProcessing = ref(false)

const processQrContent = async (content: string): Promise<VerifiedIdentity> => {
  const result = await decodeAndVerifyClaim169(content)
  return result
}

const handleWebSubmit = async () => {
  const raw = webQrInput.value.trim()
  if (!raw) return
  isWebProcessing.value = true
  try {
    const verifiedIdentity = await processQrContent(raw)
    router.push({
      name: 'claim169-identity',
      state: { verifiedIdentity: JSON.stringify(verifiedIdentity) }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    showError(`Invalid QR data: ${msg}`)
  } finally {
    isWebProcessing.value = false
  }
}

const handleScan = async () => {
  try {
    if (!isNative.value) return

    const granted = await requestPermissions()
    if (!granted) {
      showError('Camera permission is required to scan QR codes')
      return
    }

    const barcode = await scanBarcode()
    const content = barcode.rawValue || barcode.displayValue

    if (!content) {
      showError('QR code did not contain any data')
      return
    }

    isProcessing.value = true

    try {
      const verifiedIdentity = await processQrContent(content)
      router.push({
        name: 'claim169-identity',
        state: { verifiedIdentity: JSON.stringify(verifiedIdentity) }
      })
    } catch (decodeError) {
      const errorMsg = decodeError instanceof Error ? decodeError.message : String(decodeError)
      showError(`Invalid QR code format: ${errorMsg}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scan QR code'
    showError(message)
  } finally {
    isProcessing.value = false
  }
}

const handleBack = () => {
  router.back()
}

const handleCancel = async () => {
  await cleanup()
}

onMounted(() => {
  if (isNative.value) {
    handleScan()
  }
})
</script>

<template>
  <v-container fluid class="pa-4">
    <div class="d-flex align-center ga-3 mb-4">
      <v-btn icon="mdi-arrow-left" variant="tonal" size="small" @click="handleBack" aria-label="Go back" />
      <span class="text-h6 font-weight-bold">Scan Identity QR</span>
    </div>

    <div class="scanner-content d-flex flex-column align-center justify-center" style="min-height: 60vh;">
      <!-- Native idle state -->
      <div v-if="isNative && !isScanning && !isProcessing" class="text-center" style="max-width: 320px;">
        <v-sheet rounded="xl" color="info" class="d-inline-flex pa-5 mb-4" style="opacity: 0.12;">
          <v-icon size="48" color="info">mdi-qrcode</v-icon>
        </v-sheet>
        <h2 class="text-h6 font-weight-bold mb-2">Scan a Claim-169 Identity QR Code</h2>
        <p class="text-body-2 text-medium-emphasis mb-6">
          Position the QR code within the camera frame to scan and verify the identity.
        </p>
        <v-btn color="secondary" prepend-icon="mdi-camera" size="large" @click="handleScan">
          Start Scanning
        </v-btn>
      </div>

      <!-- Scanning overlay — MUST keep barcode-scanner-modal class -->
      <div v-else-if="isScanning" class="scanning-overlay barcode-scanner-modal">
        <div class="scan-frame">
          <div class="corner top-left"></div>
          <div class="corner top-right"></div>
          <div class="corner bottom-left"></div>
          <div class="corner bottom-right"></div>
          <div class="scan-line"></div>
        </div>
        <p class="scan-hint">Align QR code within frame</p>
        <button class="cancel-button" type="button" @click="handleCancel">
          Cancel
        </button>
      </div>

      <!-- Processing -->
      <div v-else-if="isProcessing" class="text-center">
        <v-progress-circular indeterminate color="secondary" size="56" class="mb-4" />
        <p class="text-body-2 text-medium-emphasis">Processing identity data...</p>
      </div>

      <!-- Web fallback -->
      <div v-else-if="!isNative" class="text-center" style="max-width: 320px; width: 100%;">
        <v-icon size="48" color="info" class="mb-4">mdi-qrcode</v-icon>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Paste raw Claim-169 QR data below to decode and verify.
        </p>
        <v-textarea
          v-model="webQrInput"
          variant="outlined"
          rows="4"
          label="QR Payload"
          placeholder="Paste QR payload here..."
          class="mb-3"
        />
        <v-btn
          color="secondary"
          block
          :disabled="!webQrInput.trim() || isWebProcessing"
          :loading="isWebProcessing"
          @click="handleWebSubmit"
          class="mb-3"
        >
          Decode
        </v-btn>
        <v-btn variant="text" @click="handleBack">
          Return to Home
        </v-btn>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
/* Scanner overlay — MUST remain unchanged for native camera transparency */
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
  border: 4px solid var(--brand, #ff6d37);
}

.corner.top-left { top: 0; left: 0; border-right: none; border-bottom: none; border-radius: 8px 0 0 0; }
.corner.top-right { top: 0; right: 0; border-left: none; border-bottom: none; border-radius: 0 8px 0 0; }
.corner.bottom-left { bottom: 0; left: 0; border-right: none; border-top: none; border-radius: 0 0 0 8px; }
.corner.bottom-right { bottom: 0; right: 0; border-left: none; border-top: none; border-radius: 0 0 8px 0; }

.scan-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--brand, #ff6d37), transparent);
  animation: scan 2s ease-in-out infinite;
}

@keyframes scan {
  0%, 100% { top: 10px; }
  50% { top: calc(100% - 10px); }
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
  min-height: 48px;
}
</style>
