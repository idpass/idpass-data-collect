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
const Field = (Formio as { Components: { components: { field: unknown } } }).Components.components.field as any;

const DEFAULT_CAPTURE_OPTIONS = {
  env: 'Developer',
  purpose: 'Auth',
  specVersion: '0.9.5',
  timeout: 30000,
  autoCapture: true,
  qualityThreshold: 60,
  deviceId: 'io.idpass.bca.finger.SECUGEN_001',
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

export default class BiometricCapture extends Field {
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

  render(_element: unknown) {
    this.fingerList = normalizeFingerSelections(this.component.captureFingers);
    this.initializeFingerStatesFromValue();
    this.statusElementId = `${this.key}-status`;

    const fingerCards = this.fingerList.map((finger) => this.renderFingerCard(finger)).join('');

    return super.render(`
      <div class="biometric-capture-container card card-body">
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
    this.refreshFingerDisplays();
    this.updateSummaryStatus();
    return refs;
  }

  private bindFingerEventHandlers(element: HTMLElement) {
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
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="skip" data-finger="${finger}">
            Cannot Capture
          </button>
        </div>
        <div class="finger-meta mt-2 text-muted small" data-role="meta"></div>
      </div>
    `;
  }

  private initializeFingerStatesFromValue(): void {
    const stored = deserializeFingerStore(this.dataValue);
    this.fingerStates = {} as Record<FingerValue, FingerCaptureState>;

    this.fingerList.forEach((finger) => {
      const existing = stored?.[finger];
      this.fingerStates[finger] = sanitizeState(existing);
    });
  }

  private ensureFingerState(finger: FingerValue): FingerCaptureState {
    if (!this.fingerStates[finger]) {
      this.fingerStates[finger] = createDefaultState();
    }
    return this.fingerStates[finger];
  }

  private persistState(): void {
    const payload: StoredBiometricValue = {
      fingers: this.fingerStates,
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
    }
  }

  private handleCaptureSuccess(finger: FingerValue, result: { result: CaptureResult }): void {
    const fingerLabel = formatFingerLabel(finger);
    const intentResult = result?.result || {};
    const parsedResponse = parseJson<{ biometrics?: unknown }>(
      intentResult.responseDataData || intentResult.responseData
    );
    const fingerprintImages = parseJson<Record<string, string>>(intentResult.fingerprintImages);
    const biometrics = parsedResponse?.biometrics;
    const fingerBio = extractBiometricForFinger(biometrics, finger);
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
    const qualityMsg = qualityScore != null ? ` (quality ${qualityScore})` : '';
    this.updateSummaryStatus(`Captured ${fingerLabel}${qualityMsg}`, '#15803d');
  }

  private handleCaptureFailure(finger: FingerValue, error: unknown): void {
    const fingerLabel = formatFingerLabel(finger);
    const errorObj = error as { message?: string } | string | undefined;
    const message = (typeof errorObj === 'object' ? errorObj?.message : errorObj) || 'Capture failed';

    const state = this.ensureFingerState(finger);
    state.status = 'error';
    state.error = String(message);
    state.lastUpdated = new Date().toISOString();

    this.persistState();
    this.updateFingerCard(finger);
    this.updateSummaryStatus(`Failed to capture ${fingerLabel}: ${state.error}`, '#b91c1c');
  }

  private skipFinger(finger: FingerValue): void {
    const state = this.ensureFingerState(finger);
    const now = new Date().toISOString();

    if (state.status === 'skipped') {
      state.status = 'pending';
      state.error = undefined;
      state.previewData = undefined;
      state.qualityScore = undefined;
      state.lastUpdated = now;
      this.updateSummaryStatus(`Re-enabled ${formatFingerLabel(finger)} for capture.`, '#0f172a');
    } else {
      state.status = 'skipped';
      state.previewData = undefined;
      state.qualityScore = undefined;
      state.error = undefined;
      state.lastUpdated = now;
      this.updateSummaryStatus(`Marked ${formatFingerLabel(finger)} as unavailable.`, '#92400e');
    }

    this.persistState();
    this.updateFingerCard(finger);
  }

  private refreshFingerDisplays(): void {
    this.fingerList.forEach((finger) => this.updateFingerCard(finger));
  }

  private updateFingerCard(finger: FingerValue): void {
    const card = this.element?.querySelector(`.finger-card[data-finger="${finger}"]`);
    if (!card) return;

    const state = this.ensureFingerState(finger);

    const statusBadge = card.querySelector('[data-role="status"]');
    if (statusBadge) {
      statusBadge.textContent = getStatusLabel(state.status);
      statusBadge.className = `badge ${getStatusBadgeClass(state.status)}`;
    }

    const previewElement = card.querySelector('[data-role="preview"]');
    if (previewElement) {
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

    const skipButton = card.querySelector('[data-action="skip"]');
    if (skipButton) {
      skipButton.textContent = state.status === 'skipped' ? 'Undo Skip' : 'Cannot Capture';
      skipButton.disabled = this.isCapturing;
    }

    const captureBtn = card.querySelector('[data-action="capture"]');
    if (captureBtn) {
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
      captureBtn.textContent = isLoading ? 'Capturing…' : 'Capture';
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

    return {
      env,
      purpose,
      specVersion,
      timeout,
      captureTime: now.toISOString(),
      transactionId,
      autoCapture,
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

function sanitizeState(state?: Partial<FingerCaptureState>): FingerCaptureState {
  if (!state) {
    return createDefaultState();
  }

  const allowed: FingerStatus[] = ['pending', 'captured', 'skipped', 'error'];
  const normalizedStatus = allowed.includes(state.status as FingerStatus) ? (state.status as FingerStatus) : 'pending';

  return {
    status: normalizedStatus,
    qualityScore: typeof state.qualityScore === 'number' ? state.qualityScore : undefined,
    previewData: typeof state.previewData === 'string' ? state.previewData : undefined,
    lastUpdated: typeof state.lastUpdated === 'string' ? state.lastUpdated : undefined,
    error: typeof state.error === 'string' ? state.error : undefined,
    rawResponse: state.rawResponse
  };
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
  qualityScore?: number | string;
}

function extractBiometricForFinger(biometrics: unknown, finger: FingerValue): BiometricData | undefined {
  if (!Array.isArray(biometrics)) {
    return undefined;
  }

  return biometrics.find((bio: BiometricData) => {
    if (!bio) return false;
    const subtype = bio.bioSubType || bio.bioSubTypeCode || bio.biosubType;
    if (Array.isArray(subtype)) {
      return subtype.includes(finger);
    }
    if (typeof subtype === 'string') {
      return subtype === finger;
    }
    return false;
  }) || biometrics[0];
}

function extractFingerprintPreview(
  fingerprintImages: unknown,
  finger: FingerValue,
  fallbackBio?: BiometricData
): string | undefined {
  if (fingerprintImages && typeof fingerprintImages === 'object') {
    const images = fingerprintImages as Record<string, string>;
    const raw = images[finger];
    if (typeof raw === 'string' && raw.length) {
      return toDataUrl(raw);
    }
  }

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
