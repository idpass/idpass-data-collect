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

import Formio from 'formiojs';
import BiometricCapturePlugin, { CaptureResult } from '../../plugins/BiometricCapture';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Field: any;
function getField() {
  if (!Field) {
    // Formio.Components may not be available yet when the mobile production
    // build uses inlineDynamicImports (class extends evaluates at module load).
    // Fall back to a minimal base class so the module can load; the real base
    // is wired up at registration time when Formio is ready.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    Field = (Formio as any)?.Components?.components?.field ?? class {};
  }
  return Field;
}

// Enable debug logging only in development environment
const DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

const DEFAULT_CAPTURE_OPTIONS = {
  env: 'Developer',
  purpose: 'Auth',
  specVersion: '0.9.5',
  timeout: 30000,
  autoCapture: true,
  qualityThreshold: 60,
  deviceId: '',
  fingers: ['Right_Thumb'],
  transactionPrefix: 'FORMIO'
};

const FINGER_VALUES = [
  'Left_Thumb',
  'Left_IndexFinger',
  'Left_MiddleFinger',
  'Left_RingFinger',
  'Left_LittleFinger',
  'Right_Thumb',
  'Right_IndexFinger',
  'Right_MiddleFinger',
  'Right_RingFinger',
  'Right_LittleFinger'
] as const;

type FingerValue = typeof FINGER_VALUES[number];
type FingerStatus = 'pending' | 'captured' | 'skipped' | 'error';

interface FingerCaptureState {
  status: FingerStatus;
  qualityScore?: number;
  previewData?: string;
  lastUpdated?: string;
  error?: string;
  rawResponse?: unknown;
}

interface StoredBiometricValue {
  fingers: Record<string, FingerCaptureState>;
  lastUpdated?: string;
}

export default class BiometricCapture extends getField() {
  static schema(...extend: unknown[]) {
    return Field.schema({
      type: 'biometricCapture',
      label: 'Biometric Capture',
      key: 'biometricCapture',
      inputType: 'hidden',
      protected: false,
      unique: false,
      persistent: true,
      intentAction: 'io.idpass.bca.finger.Capture',
      intentExtras: {},
      captureEnv: DEFAULT_CAPTURE_OPTIONS.env,
      capturePurpose: DEFAULT_CAPTURE_OPTIONS.purpose,
      captureSpecVersion: DEFAULT_CAPTURE_OPTIONS.specVersion,
      captureTimeout: DEFAULT_CAPTURE_OPTIONS.timeout,
      captureAutoCapture: DEFAULT_CAPTURE_OPTIONS.autoCapture,
      captureQualityThreshold: DEFAULT_CAPTURE_OPTIONS.qualityThreshold,
      captureFingers: DEFAULT_CAPTURE_OPTIONS.fingers,
      captureDeviceId: '',
      captureTransactionPrefix: DEFAULT_CAPTURE_OPTIONS.transactionPrefix,
      skipPolicy: 'after_attempts',
      skipAttemptsThreshold: 3,
      skipReasonRequired: false,
      skipReasons: [],
      validate: {
        required: false
      }
    }, ...extend);
  }

  static get builderInfo() {
    return {
      title: 'Biometric Capture',
      group: 'advanced',
      icon: 'fingerprint',
      weight: 0,
      documentation: '#',
      schema: BiometricCapture.schema()
    };
  }

  get defaultSchema() {
    return BiometricCapture.schema();
  }

  private fingerStates: Record<FingerValue, FingerCaptureState> = {} as Record<FingerValue, FingerCaptureState>;
  private fingerList: FingerValue[] = [];
  private statusElementId = '';
  private isCapturing = false;

  // Override setValue to refresh UI when value is set externally (e.g., when editing a form)
  setValue(value: unknown, flags?: Record<string, unknown>) {
    const result = super.setValue(value, flags);

    // If the component is already attached, refresh the UI
    if (this.element && this.fingerList.length > 0) {
      if (DEBUG) console.log('[BiometricCapture] setValue called, refreshing UI');
      this.initializeFingerStatesFromValue();
      this.refreshFingerDisplays();
      this.updateSummaryStatus();
      this.updateCaptureAllButton();
    }

    return result;
  }

  render(_element: unknown) {
    this.fingerList = normalizeFingerSelections(this.component.captureFingers);
    this.initializeFingerStatesFromValue();
    this.statusElementId = `${this.key}-status`;

    const fingerCards = this.fingerList.map((finger) => this.renderFingerCard(finger)).join('');
    const showCaptureAll = this.fingerList.length > 1;

    return super.render(`
      <div class="biometric-capture-container card card-body">
        ${showCaptureAll ? `
        <div class="capture-all-section mb-3">
          <button type="button" class="btn btn-primary w-100" data-action="capture-all">
            Capture All Fingers (${this.fingerList.length})
          </button>
        </div>
        ` : ''}
        <div class="finger-grid">
          ${fingerCards}
        </div>
        <div class="overall-status mt-3 text-muted small" id="${this.statusElementId}">
          ${this.buildSummaryText()}
        </div>
      </div>
    `);
  }

  attach(element: unknown) {
    const refs = super.attach(element);
    this.bindFingerEventHandlers(element as HTMLElement);

    // Re-initialize from stored value in case it wasn't available during render
    this.initializeFingerStatesFromValue();

    // Update UI to reflect stored state
    this.refreshFingerDisplays();
    this.updateSummaryStatus();
    this.updateCaptureAllButton();

    if (DEBUG) {
      console.log('[BiometricCapture] Attached. Current states:', 
        Object.entries(this.fingerStates).map(([k, v]) => `${k}:${v.status}`).join(', ')
      );
    }

    return refs;
  }

  private bindFingerEventHandlers(element: HTMLElement) {
    // Bind "Capture All" button
    const captureAllBtn = element.querySelector('[data-action="capture-all"]');
    if (captureAllBtn) {
      this.addEventListener(captureAllBtn, 'click', () => this.captureAllFingers());
    }

    // Bind individual finger buttons
    this.fingerList.forEach((finger) => {
      const captureBtn = element.querySelector(`[data-action="capture"][data-finger="${finger}"]`);
      if (captureBtn) {
        this.addEventListener(captureBtn, 'click', () => this.captureFinger(finger));
      }

      const skipBtn = element.querySelector(`[data-action="skip"][data-finger="${finger}"]`);
      if (skipBtn) {
        this.addEventListener(skipBtn, 'click', () => this.skipFinger(finger));
      }
    });
  }

  private renderFingerCard(finger: FingerValue): string {
    return `
      <div class="finger-card border rounded p-3 mb-3" data-finger="${finger}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="fw-semibold">${formatFingerLabel(finger)}</div>
          <span class="badge bg-secondary" data-role="status">Pending</span>
        </div>
        <div class="finger-preview mb-2 text-muted small" data-role="preview">Awaiting capture</div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary" data-action="capture" data-finger="${finger}">
            Capture
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="skip" data-finger="${finger}"></button>
        </div>
        <div class="finger-meta mt-2 text-muted small" data-role="meta"></div>
      </div>
    `;
  }

  private initializeFingerStatesFromValue(): void {
    // Try multiple sources for stored data
    const rawValue = this.dataValue || this.getValue();
    const stored = deserializeFingerStore(rawValue);

    if (DEBUG) {
      console.log('[BiometricCapture] Initializing from stored value:', {
        hasDataValue: !!this.dataValue,
        hasGetValue: !!this.getValue(),
        storedKeys: Object.keys(stored),
        fingerList: this.fingerList
      });
    }

    this.fingerStates = {} as Record<FingerValue, FingerCaptureState>;

    this.fingerList.forEach((finger) => {
      const existing = stored?.[finger];
      this.fingerStates[finger] = sanitizeState(existing, finger);

      if (existing && DEBUG) {
        console.log(`[BiometricCapture] Restored state for ${finger}:`, {
          status: this.fingerStates[finger].status,
          hasPreviewData: !!this.fingerStates[finger].previewData,
          qualityScore: this.fingerStates[finger].qualityScore
        });
      }
    });
  }

  private ensureFingerState(finger: FingerValue): FingerCaptureState {
    if (!this.fingerStates[finger]) {
      this.fingerStates[finger] = createDefaultState();
    }
    return this.fingerStates[finger];
  }

  private persistState(): void {
    // Strip sensitive raw biometric templates before persisting to reduce privacy risk
    // Keep preview images (small thumbnails) for UI display, but exclude rawResponse
    // which contains full fingerprint templates that would be synced to backend
    const sanitizedFingers: Record<string, FingerCaptureState> = {};
    
    Object.entries(this.fingerStates).forEach(([finger, state]) => {
      sanitizedFingers[finger] = {
        status: state.status,
        qualityScore: state.qualityScore,
        previewData: state.previewData, // Keep preview for UI display
        lastUpdated: state.lastUpdated,
        error: state.error
        // Explicitly exclude: rawResponse (contains sensitive biometric templates)
      };
    });
    
    const payload: StoredBiometricValue = {
      fingers: sanitizedFingers,
      lastUpdated: new Date().toISOString()
    };
    this.setValue(payload);
  }

  private buildSummaryText(): string {
    const total = this.fingerList.length;
    if (!total) {
      return 'No fingers configured for capture';
    }

    const captured = this.fingerList.filter((finger) => this.fingerStates[finger]?.status === 'captured').length;
    const skipped = this.fingerList.filter((finger) => this.fingerStates[finger]?.status === 'skipped').length;
    return `Captured ${captured}/${total}${skipped ? ` · Skipped ${skipped}` : ''}`;
  }

  private async captureFinger(finger: FingerValue): Promise<void> {
    if (this.isCapturing) {
      this.updateSummaryStatus('Another capture is currently running. Please wait.', '#d97706');
      return;
    }

    const action = resolveIntentAction(this.component.intentAction);
    const fingerLabel = formatFingerLabel(finger);
    this.isCapturing = true;
    this.toggleFingerLoadingState(finger, true);
    this.updateCaptureAllButton();
    this.updateSummaryStatus(`Capturing ${fingerLabel}...`, '#0d6efd');

    try {
      const requestPayload = this.buildCaptureRequest([finger]);
      const requestJson = JSON.stringify(requestPayload);
      const generatedExtras = {
        request: requestJson,
        input: requestJson,
        autoCapture: Boolean(requestPayload.autoCapture ?? false),
        transactionId: requestPayload.transactionId
      };
      const manualExtras = parseIntentExtras(this.component.intentExtras);
      const extras = { ...generatedExtras, ...manualExtras };

      const result = await BiometricCapturePlugin.launchCapture({ action, extras });
      this.handleCaptureSuccess(finger, result);
    } catch (error: unknown) {
      this.handleCaptureFailure(finger, error);
    } finally {
      this.isCapturing = false;
      this.toggleFingerLoadingState(finger, false);
      this.updateCaptureAllButton();
    }
  }

  private async captureAllFingers(): Promise<void> {
    if (this.isCapturing) {
      this.updateSummaryStatus('Another capture is currently running. Please wait.', '#d97706');
      return;
    }

    // Get all fingers that are still pending or had errors
    const pendingFingers = this.fingerList.filter(
      (finger) => {
        const status = this.fingerStates[finger]?.status;
        return status === 'pending' || status === 'error';
      }
    );

    if (pendingFingers.length === 0) {
      this.updateSummaryStatus('All fingers have been captured or skipped.', '#6b7280');
      return;
    }

    const action = resolveIntentAction(this.component.intentAction);
    this.isCapturing = true;
    this.updateCaptureAllButton();
    pendingFingers.forEach((finger) => this.toggleFingerLoadingState(finger, true));
    this.updateSummaryStatus(`Capturing ${pendingFingers.length} finger(s)...`, '#0d6efd');

    try {
      const requestPayload = this.buildCaptureRequest(pendingFingers);
      const requestJson = JSON.stringify(requestPayload);
      const generatedExtras = {
        request: requestJson,
        input: requestJson,
        autoCapture: Boolean(requestPayload.autoCapture ?? false),
        transactionId: requestPayload.transactionId
      };
      const manualExtras = parseIntentExtras(this.component.intentExtras);
      const extras = { ...generatedExtras, ...manualExtras };

      const result = await BiometricCapturePlugin.launchCapture({ action, extras });
      this.handleMultiCaptureSuccess(pendingFingers, result);
    } catch (error: unknown) {
      this.handleMultiCaptureFailure(pendingFingers, error);
    } finally {
      this.isCapturing = false;
      pendingFingers.forEach((finger) => this.toggleFingerLoadingState(finger, false));
      this.updateCaptureAllButton();
    }
  }

  private handleMultiCaptureSuccess(fingers: FingerValue[], result: { result: CaptureResult }): void {
    const intentResult = result?.result || {};

    // Debug logging for troubleshooting
    if (DEBUG) {
      console.log('[BiometricCapture] Raw intent result keys:', Object.keys(intentResult));
    }

    // Try multiple possible response data locations
    const responseDataRaw = intentResult.responseDataData || intentResult.responseData || intentResult.response;
    const parsedResponse = parseJson<{ biometrics?: BiometricData[] }>(responseDataRaw);

    // Try multiple possible fingerprint image locations
    const fingerprintImagesRaw = intentResult.fingerprintImages || intentResult.fingerprint_images;
    const fingerprintImages = parseJson<Record<string, string>>(fingerprintImagesRaw);

    const biometrics = parsedResponse?.biometrics;

    if (DEBUG) {
      console.log('[BiometricCapture] Parsed response:', {
        hasBiometrics: !!biometrics,
        biometricsCount: biometrics?.length || 0,
        hasFingerprintImages: !!fingerprintImages,
        fingerprintImageKeys: fingerprintImages ? Object.keys(fingerprintImages) : []
      });
    }

    let capturedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    fingers.forEach((finger, index) => {
      // Try to find biometric data for this finger
      let fingerBio = extractBiometricForFinger(biometrics, finger);

      // Fallback: if we have biometrics but couldn't match by bioSubType, try by index
      if (!fingerBio && biometrics && biometrics.length > 0 && index < biometrics.length) {
        fingerBio = biometrics[index];
        if (DEBUG) {
          console.log(`[BiometricCapture] Using fallback index ${index} for finger ${finger}`);
        }
      }

      // Log the raw biometric data to understand BCA's response format (only in debug mode)
      if (DEBUG) {
        console.log(`[BiometricCapture] Raw biometric data for ${finger}:`, JSON.stringify(fingerBio, null, 2));
      }

      // Check if BCA returned this finger as skipped
      if (isBioSkipped(fingerBio)) {
        if (DEBUG) {
          console.log(`[BiometricCapture] Finger ${finger} was skipped by user in BCA`);
        }
        this.fingerStates[finger] = {
          status: 'skipped',
          lastUpdated: new Date().toISOString()
        };
        skippedCount++;
      } else if (fingerBio && !fingerBio.error) {
        const previewData = extractFingerprintPreview(fingerprintImages, finger, fingerBio);
        const qualityScore = extractQualityScore(fingerBio);

        if (DEBUG) {
          console.log(`[BiometricCapture] Finger ${finger}: quality=${qualityScore}, hasPreview=${!!previewData}`);
        }

        this.fingerStates[finger] = {
          status: 'captured',
          qualityScore: qualityScore,
          previewData: previewData,
          lastUpdated: new Date().toISOString(),
          rawResponse: {
            intentResult,
            parsedResponse,
            fingerprintImages
          }
        };
        capturedCount++;
      } else {
        const errorMsg = fingerBio?.error
          ? `${fingerBio.error.errorCode || ''}: ${fingerBio.error.errorInfo || fingerBio.error.errorMessage || 'Capture failed'}`
          : 'No biometric data returned';

        if (DEBUG) {
          console.log(`[BiometricCapture] Finger ${finger} error: ${errorMsg}`);
        }

        this.fingerStates[finger] = {
          status: 'error',
          error: formatErrorMessage(errorMsg),
          lastUpdated: new Date().toISOString()
        };
        errorCount++;
      }

      this.updateFingerCard(finger);
    });

    this.persistState();

    // Build summary message based on results
    const parts: string[] = [];
    if (capturedCount > 0) parts.push(`captured ${capturedCount}`);
    if (skippedCount > 0) parts.push(`skipped ${skippedCount}`);
    if (errorCount > 0) parts.push(`failed ${errorCount}`);

    if (errorCount === 0 && skippedCount === 0) {
      this.updateSummaryStatus(`Successfully captured ${capturedCount} finger(s)`, '#15803d');
    } else if (capturedCount === 0 && skippedCount === 0) {
      this.updateSummaryStatus(`Failed to capture all ${errorCount} finger(s)`, '#b91c1c');
    } else if (errorCount === 0) {
      this.updateSummaryStatus(`${parts.join(', ')} finger(s)`, '#15803d');
    } else {
      this.updateSummaryStatus(`${parts.join(', ')} finger(s)`, '#d97706');
    }
  }

  private handleMultiCaptureFailure(fingers: FingerValue[], error: unknown): void {
    const errorObj = error as { message?: string; code?: string } | string | undefined;
    const rawMessage = (typeof errorObj === 'object' ? errorObj?.message : errorObj) || 'Capture failed';
    const message = formatErrorMessage(rawMessage);

    fingers.forEach((finger) => {
      const state = this.ensureFingerState(finger);
      state.status = 'error';
      state.error = message;
      state.lastUpdated = new Date().toISOString();
      this.updateFingerCard(finger);
    });

    this.persistState();
    this.updateSummaryStatus(`Failed to capture ${fingers.length} finger(s): ${message}`, '#b91c1c');
  }

  private updateCaptureAllButton(): void {
    const captureAllBtn = this.element?.querySelector('[data-action="capture-all"]') as HTMLButtonElement | null;
    if (!captureAllBtn) return;

    const pendingFingers = this.fingerList.filter(
      (finger) => {
        const status = this.fingerStates[finger]?.status;
        return status === 'pending' || status === 'error';
      }
    );

    captureAllBtn.disabled = this.isCapturing || pendingFingers.length === 0;

    if (this.isCapturing) {
      captureAllBtn.textContent = 'Capturing...';
    } else if (pendingFingers.length === 0) {
      captureAllBtn.textContent = 'All Fingers Captured';
    } else {
      captureAllBtn.textContent = `Capture All Fingers (${pendingFingers.length})`;
    }
  }

  private handleCaptureSuccess(finger: FingerValue, result: { result: CaptureResult }): void {
    const fingerLabel = formatFingerLabel(finger);
    const intentResult = result?.result || {};

    // Debug logging
    if (DEBUG) {
      console.log('[BiometricCapture] Single capture result keys:', Object.keys(intentResult));
    }

    // Try multiple possible response data locations
    const responseDataRaw = intentResult.responseDataData || intentResult.responseData || intentResult.response;
    const parsedResponse = parseJson<{ biometrics?: BiometricData[] }>(responseDataRaw);

    // Try multiple possible fingerprint image locations
    const fingerprintImagesRaw = intentResult.fingerprintImages || intentResult.fingerprint_images;
    const fingerprintImages = parseJson<Record<string, string>>(fingerprintImagesRaw);

    const biometrics = parsedResponse?.biometrics;
    const fingerBio = extractBiometricForFinger(biometrics, finger);

    if (DEBUG) {
      console.log('[BiometricCapture] Single capture:', {
        finger,
        hasBiometrics: !!biometrics,
        hasFingerBio: !!fingerBio,
        isSkipped: isBioSkipped(fingerBio)
      });
    }

    // Check if BCA returned this finger as skipped
    if (isBioSkipped(fingerBio)) {
      this.fingerStates[finger] = {
        status: 'skipped',
        lastUpdated: new Date().toISOString()
      };

      this.persistState();
      this.updateFingerCard(finger);
      this.updateCaptureAllButton();
      this.updateSummaryStatus(`${fingerLabel} was marked as unavailable`, '#92400e');
      return;
    }

    const previewData = extractFingerprintPreview(fingerprintImages, finger, fingerBio);
    const qualityScore = extractQualityScore(fingerBio);

    this.fingerStates[finger] = {
      status: 'captured',
      qualityScore: qualityScore,
      previewData: previewData,
      lastUpdated: new Date().toISOString(),
      rawResponse: {
        intentResult,
        parsedResponse,
        fingerprintImages
      }
    };

    this.persistState();
    this.updateFingerCard(finger);
    this.updateCaptureAllButton();
    const qualityMsg = qualityScore != null ? ` (quality ${qualityScore})` : '';
    this.updateSummaryStatus(`Captured ${fingerLabel}${qualityMsg}`, '#15803d');
  }

  private handleCaptureFailure(finger: FingerValue, error: unknown): void {
    const fingerLabel = formatFingerLabel(finger);
    const errorObj = error as { message?: string; code?: string } | string | undefined;
    const rawMessage = (typeof errorObj === 'object' ? errorObj?.message : errorObj) || 'Capture failed';

    // Convert technical error messages to user-friendly messages
    const message = formatErrorMessage(rawMessage);

    const state = this.ensureFingerState(finger);
    state.status = 'error';
    state.error = message;
    state.lastUpdated = new Date().toISOString();

    this.persistState();
    this.updateFingerCard(finger);
    this.updateCaptureAllButton();
    this.updateSummaryStatus(`Failed to capture ${fingerLabel}: ${message}`, '#b91c1c');
  }

  private skipFinger(finger: FingerValue): void {
    const currentState = this.fingerStates[finger];
    const now = new Date().toISOString();

    if (currentState?.status === 'skipped') {
      // Un-skip: create fresh pending state
      this.fingerStates[finger] = {
        status: 'pending',
        lastUpdated: now
      };
      this.updateSummaryStatus(`Re-enabled ${formatFingerLabel(finger)} for capture.`, '#0f172a');
    } else {
      // Skip: create fresh skipped state (no preview data, no raw response)
      this.fingerStates[finger] = {
        status: 'skipped',
        lastUpdated: now
      };
      this.updateSummaryStatus(`Marked ${formatFingerLabel(finger)} as unavailable.`, '#92400e');
    }

    this.persistState();
    this.updateFingerCard(finger);
    this.updateCaptureAllButton();
  }

  private refreshFingerDisplays(): void {
    this.fingerList.forEach((finger) => this.updateFingerCard(finger));
  }

  private updateFingerCard(finger: FingerValue): void {
    const card = this.element?.querySelector(`.finger-card[data-finger="${finger}"]`);
    if (!card) return;

    const state = this.fingerStates[finger] || createDefaultState();

    if (DEBUG) {
      console.log(`[BiometricCapture] updateFingerCard for ${finger}:`, {
        status: state.status,
        hasPreviewData: !!state.previewData,
        previewDataLength: state.previewData?.length || 0
      });
    }

    const statusBadge = card.querySelector('[data-role="status"]');
    if (statusBadge) {
      statusBadge.textContent = getStatusLabel(state.status);
      statusBadge.className = `badge ${getStatusBadgeClass(state.status)}`;
    }

    const previewElement = card.querySelector('[data-role="preview"]') as HTMLElement | null;
    if (previewElement) {
      // Clear all content first
      previewElement.innerHTML = '';
      previewElement.classList.remove('text-danger', 'text-muted');

      if (state.status === 'captured') {
        if (state.previewData) {
          const img = document.createElement('img');
          img.src = state.previewData;
          img.alt = `${formatFingerLabel(finger)} preview`;
          img.className = 'img-fluid rounded border mb-2';
          previewElement.appendChild(img);
        }

        const quality = document.createElement('div');
        quality.className = 'text-muted small';
        quality.textContent = state.qualityScore != null
          ? `Quality score: ${state.qualityScore}`
          : 'No quality score provided';
        previewElement.appendChild(quality);
      } else if (state.status === 'skipped') {
        previewElement.classList.add('text-muted');
        previewElement.textContent = 'Marked as unavailable';
      } else if (state.status === 'error') {
        previewElement.classList.add('text-danger');
        previewElement.textContent = state.error || 'Capture failed';
      } else {
        previewElement.classList.add('text-muted');
        previewElement.textContent = 'Awaiting capture';
      }
    }

    const metaElement = card.querySelector('[data-role="meta"]');
    if (metaElement) {
      metaElement.textContent = state.lastUpdated ? `Last updated ${formatTimestamp(state.lastUpdated)}` : '';
    }

    const skipButton = card.querySelector('[data-action="skip"]') as HTMLButtonElement | null;
    if (skipButton) {
      const skipText = getSkipButtonText(state.status);
      skipButton.textContent = skipText;
      // Hide button if no text (captured state or pending with no errors)
      skipButton.style.display = skipText ? '' : 'none';
      skipButton.disabled = this.isCapturing;
    }

    const captureBtn = card.querySelector('[data-action="capture"]') as HTMLButtonElement | null;
    if (captureBtn) {
      captureBtn.textContent = getCaptureButtonText(state.status);
      if (state.status === 'captured') {
        captureBtn.className = 'btn btn-sm btn-outline-primary';
      } else {
        captureBtn.className = 'btn btn-sm btn-primary';
      }
      captureBtn.disabled = this.isCapturing;
    }
  }

  private updateSummaryStatus(message?: string, color?: string): void {
    const statusElement = this.element?.querySelector(`#${this.statusElementId}`);
    if (!statusElement) return;

    if (message) {
      statusElement.textContent = message;
      statusElement.style.color = color ?? '#374151';
      return;
    }

    statusElement.textContent = this.buildSummaryText();
    statusElement.style.color = '#374151';
  }

  private toggleFingerLoadingState(finger: FingerValue, isLoading: boolean): void {
    const card = this.element?.querySelector(`.finger-card[data-finger="${finger}"]`);
    if (!card) return;

    const captureBtn = card.querySelector('[data-action="capture"]');
    if (captureBtn) {
      captureBtn.disabled = isLoading;
      const state = this.ensureFingerState(finger);
      captureBtn.textContent = isLoading ? 'Capturing…' : getCaptureButtonText(state.status);
    }

    const skipBtn = card.querySelector('[data-action="skip"]');
    if (skipBtn) {
      skipBtn.disabled = isLoading;
    }
  }

  private buildCaptureRequest(fingers: FingerValue[]) {
    const now = new Date();
    const env = this.component.captureEnv || DEFAULT_CAPTURE_OPTIONS.env;
    const purpose = this.component.capturePurpose || DEFAULT_CAPTURE_OPTIONS.purpose;
    const specVersion = this.component.captureSpecVersion || DEFAULT_CAPTURE_OPTIONS.specVersion;
    const timeout = Number(this.component.captureTimeout ?? DEFAULT_CAPTURE_OPTIONS.timeout);
    const autoCapture = this.component.captureAutoCapture !== undefined
      ? Boolean(this.component.captureAutoCapture)
      : DEFAULT_CAPTURE_OPTIONS.autoCapture;
    const qualityThreshold = Number(this.component.captureQualityThreshold ?? DEFAULT_CAPTURE_OPTIONS.qualityThreshold);
    const deviceId = (this.component.captureDeviceId || '').trim() || DEFAULT_CAPTURE_OPTIONS.deviceId;
    const transactionPrefix = this.component.captureTransactionPrefix || DEFAULT_CAPTURE_OPTIONS.transactionPrefix;
    const transactionId = `${transactionPrefix}_${now.getTime()}`;

    const skipPolicy = this.component.skipPolicy || 'after_attempts';
    const skipAttemptsThreshold = Number(this.component.skipAttemptsThreshold ?? 3);
    const skipReasonRequired = Boolean(this.component.skipReasonRequired ?? false);
    const skipReasons = Array.isArray(this.component.skipReasons) ? this.component.skipReasons : [];

    return {
      env,
      purpose,
      specVersion,
      timeout,
      captureTime: now.toISOString(),
      transactionId,
      autoCapture,
      skipPolicy,
      skipAttemptsThreshold,
      skipReasonRequired,
      skipReasons,
      bio: [
        {
          type: 'Finger',
          count: fingers.length || 1,
          bioSubType: fingers,
          requestedScore: qualityThreshold,
          deviceId,
          deviceSubId: '1',
          previousHash: '',
          exception: []
        }
      ]
    };
  }
}

function normalizeFingerSelections(value: unknown): FingerValue[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is FingerValue => typeof entry === 'string' && FINGER_VALUES.includes(entry as FingerValue));
  }

  if (typeof value === 'string' && value.length) {
    return normalizeFingerSelections([value]);
  }

  return [...DEFAULT_CAPTURE_OPTIONS.fingers] as FingerValue[];
}

function resolveIntentAction(action: unknown): string {
  const normalized = typeof action === 'string' && action.length ? action : '';
  const legacyAction = 'io.idpass.bca.CAPTURE';
  const defaultAction = 'io.idpass.bca.finger.Capture';

  if (!normalized) {
    return defaultAction;
  }

  if (normalized.toLowerCase() === legacyAction.toLowerCase()) {
    return defaultAction;
  }

  return normalized;
}

function parseIntentExtras(extras: unknown): Record<string, string | number | boolean> {
  if (!extras) {
    return {};
  }

  if (typeof extras === 'string') {
    try {
      return JSON.parse(extras) as Record<string, string | number | boolean>;
    } catch {
      return {};
    }
  }

  if (typeof extras === 'object') {
    return extras as Record<string, string | number | boolean>;
  }

  return {};
}

function deserializeFingerStore(value: unknown): Record<string, FingerCaptureState> {
  if (!value) return {};

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if ('fingers' in obj && typeof obj.fingers === 'object' && obj.fingers !== null) {
      return obj.fingers as Record<string, FingerCaptureState>;
    }
    return parsed as Record<string, FingerCaptureState>;
  }

  return {};
}

function sanitizeState(state?: Partial<FingerCaptureState>, finger?: FingerValue): FingerCaptureState {
  if (!state) {
    return createDefaultState();
  }

  const allowed: FingerStatus[] = ['pending', 'captured', 'skipped', 'error'];
  const normalizedStatus = allowed.includes(state.status as FingerStatus) ? (state.status as FingerStatus) : 'pending';

  // For skipped fingers, explicitly clear preview data and raw response
  // This ensures no preview images are shown for skipped fingers
  if (normalizedStatus === 'skipped') {
    return {
      status: 'skipped',
      lastUpdated: typeof state.lastUpdated === 'string' ? state.lastUpdated : undefined
    };
  }

  // Try to extract previewData from rawResponse if not directly available
  let previewData = typeof state.previewData === 'string' ? state.previewData : undefined;
  let qualityScore = typeof state.qualityScore === 'number' ? state.qualityScore : undefined;

  if (!previewData && state.rawResponse && finger) {
    const extracted = extractPreviewFromRawResponse(state.rawResponse, finger);
    if (extracted.previewData) {
      previewData = extracted.previewData;
    }
    if (extracted.qualityScore !== undefined && qualityScore === undefined) {
      qualityScore = extracted.qualityScore;
    }
  }

  return {
    status: normalizedStatus,
    qualityScore: qualityScore,
    previewData: previewData,
    lastUpdated: typeof state.lastUpdated === 'string' ? state.lastUpdated : undefined,
    error: typeof state.error === 'string' ? state.error : undefined,
    rawResponse: state.rawResponse
  };
}

function extractPreviewFromRawResponse(
  rawResponse: unknown,
  finger: FingerValue
): { previewData?: string; qualityScore?: number } {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return {};
  }

  const raw = rawResponse as Record<string, unknown>;
  const parsedResponse = raw.parsedResponse as Record<string, unknown> | undefined;

  if (!parsedResponse) {
    return {};
  }

  const biometrics = parsedResponse.biometrics as BiometricData[] | undefined;
  if (!Array.isArray(biometrics)) {
    return {};
  }

  // Find the biometric data for this finger
  const fingerBio = extractBiometricForFinger(biometrics, finger);
  if (!fingerBio) {
    return {};
  }

  let previewData: string | undefined;

  // Check for previewImage (new BCA format)
  if (typeof fingerBio.previewImage === 'string' && fingerBio.previewImage.length > 0) {
    previewData = toDataUrl(fingerBio.previewImage);
  }
  // Fallback to fingerprintImage (legacy format)
  else if (typeof fingerBio.fingerprintImage === 'string' && fingerBio.fingerprintImage.length > 0) {
    previewData = toDataUrl(fingerBio.fingerprintImage);
  }

  const qualityScore = extractQualityScore(fingerBio);

  return { previewData, qualityScore };
}

function createDefaultState(): FingerCaptureState {
  return { status: 'pending' };
}

function formatFingerLabel(finger: FingerValue): string {
  const [hand, fingerName] = finger.split('_');
  const spaced = fingerName.replace(/([A-Z])/g, ' $1').trim();
  return `${hand} ${spaced}`.trim();
}

function getStatusLabel(status: FingerStatus): string {
  switch (status) {
    case 'captured':
      return 'Captured';
    case 'skipped':
      return 'Skipped';
    case 'error':
      return 'Error';
    default:
      return 'Pending';
  }
}

function getStatusBadgeClass(status: FingerStatus): string {
  switch (status) {
    case 'captured':
      return 'bg-success';
    case 'skipped':
      return 'bg-warning text-dark';
    case 'error':
      return 'bg-danger';
    default:
      return 'bg-secondary';
  }
}

function getCaptureButtonText(status: FingerStatus): string {
  switch (status) {
    case 'captured':
      return 'Recapture';
    default:
      return 'Capture';
  }
}

function getSkipButtonText(status: FingerStatus): string {
  switch (status) {
    case 'captured':
      // Allow marking captured finger as unavailable (e.g., wrong finger captured)
      return 'Mark Unavailable';
    case 'skipped':
      return 'Undo Skip';
    default:
      // For pending and error states, show "Cannot Capture"
      return 'Cannot Capture';
  }
}

function parseJson<T = unknown>(value: unknown): T | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  if (typeof value === 'object') {
    return value as T;
  }

  return undefined;
}

interface BiometricData {
  bioSubType?: string | string[];
  bioSubTypeCode?: string | string[];
  biosubType?: string | string[];
  fingerprintImage?: string;
  previewImage?: string;
  qualityScore?: number | string;
  // BCA may use various fields to indicate a skipped finger
  notCaptured?: boolean;
  skipped?: boolean;
  captured?: boolean;
  captureStatus?: string;
  status?: string;
  // Allow any additional properties for flexibility
  [key: string]: unknown;
  error?: {
    errorCode?: string;
    errorInfo?: string;
    errorMessage?: string;
  };
}

function extractBiometricForFinger(biometrics: unknown, finger: FingerValue): BiometricData | undefined {
  if (!Array.isArray(biometrics)) {
    return undefined;
  }

  // Try to find exact match first
  const exactMatch = biometrics.find((bio: BiometricData) => {
    if (!bio) return false;
    const subtype = bio.bioSubType || bio.bioSubTypeCode || bio.biosubType;
    if (Array.isArray(subtype)) {
      return subtype.includes(finger);
    }
    if (typeof subtype === 'string') {
      return subtype === finger;
    }
    return false;
  });

  if (exactMatch) {
    return exactMatch;
  }

  // If only one biometric and one finger requested, use it
  if (biometrics.length === 1) {
    return biometrics[0];
  }

  // Try to match by index based on order (fallback for multi-finger capture)
  return undefined;
}

function extractFingerprintPreview(
  fingerprintImages: unknown,
  finger: FingerValue,
  fallbackBio?: BiometricData
): string | undefined {
  // Do not extract preview for skipped biometrics
  if (isBioSkipped(fallbackBio)) {
    return undefined;
  }

  // First, check fingerprintImages map (legacy format)
  if (fingerprintImages && typeof fingerprintImages === 'object') {
    const images = fingerprintImages as Record<string, string>;
    const raw = images[finger];
    if (typeof raw === 'string' && raw.length) {
      return toDataUrl(raw);
    }
  }

  // Check previewImage in biometric data (new BCA format)
  if (fallbackBio && typeof fallbackBio.previewImage === 'string') {
    const value = fallbackBio.previewImage;
    return value.startsWith('data:') ? value : toDataUrl(value);
  }

  // Fallback to fingerprintImage (legacy format)
  if (fallbackBio && typeof fallbackBio.fingerprintImage === 'string') {
    const value = fallbackBio.fingerprintImage;
    return value.startsWith('data:') ? value : toDataUrl(value);
  }

  return undefined;
}

function extractQualityScore(bio: BiometricData | undefined): number | undefined {
  if (!bio || bio.qualityScore == null) {
    return undefined;
  }

  const score = typeof bio.qualityScore === 'string' ? parseFloat(bio.qualityScore) : bio.qualityScore;
  return Number.isFinite(score) ? Number(score) : undefined;
}

/**
 * Check if a biometric response indicates the finger was skipped by the user in BCA.
 * BCA may return skipped fingers with various field patterns.
 */
function isBioSkipped(bio: BiometricData | undefined): boolean {
  if (!bio) return false;
  
  // Direct boolean indicators
  if (bio.notCaptured === true) return true;
  if (bio.skipped === true) return true;
  if (bio.captured === false) return true;
  
  // Check captureStatus field
  if (typeof bio.captureStatus === 'string') {
    const status = bio.captureStatus.toLowerCase();
    if (status === 'skipped' || status === 'not_captured' || status === 'notcaptured' || status === 'exception') {
      return true;
    }
  }
  
  // Check generic status field
  if (typeof bio.status === 'string') {
    const status = bio.status.toLowerCase();
    if (status === 'skipped' || status === 'not_captured' || status === 'notcaptured' || status === 'exception') {
      return true;
    }
  }
  
  // Check for skip-related error codes from BCA
  if (bio.error) {
    const errorCode = String(bio.error.errorCode || '').toLowerCase();
    const errorInfo = String(bio.error.errorInfo || '').toLowerCase();
    const errorMessage = String(bio.error.errorMessage || '').toLowerCase();
    
    // Common skip/not-captured indicators in error responses
    if (errorCode.includes('skip') || errorCode.includes('not_captured') || errorCode === '0') {
      return true;
    }
    if (errorInfo.includes('skipped') || errorInfo.includes('not captured') || errorInfo.includes('user skipped') || errorInfo.includes('exception')) {
      return true;
    }
    if (errorMessage.includes('skipped') || errorMessage.includes('not captured') || errorMessage.includes('user skipped') || errorMessage.includes('exception')) {
      return true;
    }
  }
  
  // Check for any other properties that might indicate skip
  // Log unknown properties to help debug
  const knownProps = ['bioSubType', 'bioSubTypeCode', 'biosubType', 'fingerprintImage', 'previewImage', 
                      'qualityScore', 'notCaptured', 'skipped', 'captured', 'captureStatus', 'status', 'error'];
  const unknownProps = Object.keys(bio).filter(k => !knownProps.includes(k));
  if (unknownProps.length > 0 && DEBUG) {
    console.log('[BiometricCapture] Unknown biometric properties:', unknownProps, 
      'Values:', unknownProps.map(k => `${k}=${JSON.stringify(bio[k])}`).join(', '));
  }
  
  return false;
}

function toDataUrl(raw: string): string {
  if (!raw) return raw;
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
}

function formatTimestamp(value: string): string {
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return value;
  }
}

/**
 * Convert technical error messages to user-friendly messages.
 * Maps common BCA and system errors to actionable guidance.
 */
function formatErrorMessage(rawMessage: string): string {
  const message = String(rawMessage).toLowerCase();

  // BCA app not installed
  if (message.includes('no application found') || message.includes('no activity found')) {
    return 'Biometric Capture App (BCA) is not installed. Please install BCA and try again.';
  }

  // Capture was canceled - usually means device not ready or user canceled
  if (message === 'capture was canceled' || message.includes('result_canceled')) {
    return 'Capture was canceled. Please ensure a biometric device is connected in the BCA app and try again.';
  }

  // Device not ready errors
  if (message.includes('device not ready') || message.includes('device not found') || message.includes('no device')) {
    return 'No biometric device detected. Please connect a fingerprint scanner and try again.';
  }

  // Device busy
  if (message.includes('device busy') || message.includes('another capture')) {
    return 'Biometric device is busy. Please wait and try again.';
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Capture timed out. Please place your finger on the scanner and try again.';
  }

  // Quality errors
  if (message.includes('quality') || message.includes('poor quality')) {
    return 'Fingerprint quality too low. Please clean the scanner and try again.';
  }

  // Permission errors
  if (message.includes('permission') || message.includes('denied')) {
    return 'USB permission denied. Please grant permission to the biometric device.';
  }

  // SDK/Internal errors
  if (message.includes('sdk error') || message.includes('internal error')) {
    return 'Internal error occurred. Please restart the BCA app and try again.';
  }

  // Return original message if no match (capitalize first letter)
  const trimmed = rawMessage.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
