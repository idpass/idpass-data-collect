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

/**
 * Custom Form.io builder components for the ID PASS admin builder.
 *
 * Ports the two custom components that used to be loaded as a global script
 * (`public/biometric-component.js`) inside the now-removed builder iframe
 * (OP #1059). They are registered against the bundled `@formio/js` so they
 * appear in the builder palette (Advanced group) with their settings panels.
 *
 * These are BUILDER-side definitions only — schema, palette entry
 * (`builderInfo`) and settings (`editForm`). Capture/scan behaviour is runtime
 * and lives in the mobile app (`packages/mobile/src/formio/components/`); the
 * admin never captures, so the default Field render is sufficient here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Formio } from '@formio/js'

let registered = false

/**
 * Tenant credential templates available to the "Inji Verification" field tab.
 * Set by the builder host (`FormioBuilder.vue`) from `draft.inji.credentialTemplates`
 * BEFORE `registerBuilderComponents()` / `Formio.builder()` mounts. Read at
 * editForm-call time (when a field is clicked) so the template dropdown reflects
 * the current tenant config without re-registering components.
 */
let currentCredentialTemplates: Array<{ id: string; claimLabel?: string }> = []

export function setCredentialTemplates(templates: Array<{ id: string; claimLabel?: string }> | undefined | null): void {
  currentCredentialTemplates = Array.isArray(templates) ? templates : []
}

/** Field types that are never VC-filled — skip the Inji tab to avoid clutter. */
const INJI_TAB_SKIP = new Set([
  'biometricCapture',
  'claim169Scanner',
  'button',
  'panel',
  'columns',
  'well',
  'table',
  'tabs',
  'fieldset',
  'content',
  'htmlelement',
  'form',
  'container',
  'datagrid',
  'editgrid',
])

/**
 * The "Inji Verification" edit tab appended to a field's settings. Writes the
 * stock Form.io custom properties the mobile runtime reads
 * (`properties.injiTemplate` + `properties.injiClaimPath`) — NOT top-level keys.
 * Built fresh per call so the template dropdown reflects the latest tenant config.
 */
function injiVerificationTab(): any {
  const values = currentCredentialTemplates.map((t) => ({ label: t.claimLabel || t.id, value: t.id }))
  return {
    key: 'inji',
    label: 'Inji Verification',
    weight: 60,
    components: [
      {
        type: 'select',
        key: 'properties.injiTemplate',
        label: 'Verifiable from credential template',
        tooltip:
          'If set, this field shows a "Verify" button that fills it from a matching verified credential (Inji wallet).',
        dataSrc: 'values',
        data: { values },
        clearOnRefresh: false,
      },
      {
        type: 'textfield',
        key: 'properties.injiClaimPath',
        label: 'Claim path (JSONPath)',
        placeholder: '$.credentialSubject.fullName',
        tooltip: 'Which credential claim fills this field, e.g. $.credentialSubject.dateOfBirth.',
        customConditional: 'show = !!(data.properties && data.properties.injiTemplate);',
      },
    ],
  }
}

/**
 * Append the Inji Verification tab to every input field's editForm. Wraps each
 * component's static `editForm` once; the wrapper reads `currentCredentialTemplates`
 * live, so updating templates needs no re-registration.
 */
function injectInjiTab(Components: any): void {
  const comps = Components.components || {}
  for (const name of Object.keys(comps)) {
    if (INJI_TAB_SKIP.has(name)) continue
    const Comp = comps[name]
    if (!Comp || typeof Comp.editForm !== 'function' || (Comp.editForm as any).__injiWrapped) continue
    const orig = Comp.editForm
    const wrapped = function (this: unknown, ...args: any[]) {
      const form = orig.apply(this, args)
      if (form && Array.isArray(form.components) && !form.components.some((c: any) => c && c.key === 'inji')) {
        form.components.push(injiVerificationTab())
      }
      return form
    }
    ;(wrapped as any).__injiWrapped = true
    Comp.editForm = wrapped
  }
}

/**
 * Register the ID PASS custom builder components with Form.io. Idempotent and
 * must run before `Formio.builder(...)` so the palette includes them.
 */
export function registerBuilderComponents(): void {
  if (registered) return

  const Components = (Formio as any).Components
  const Field: any = Components.components.field

  class BiometricCapture extends Field {
    static schema(...extend: any[]) {
      return Field.schema(
        {
          type: 'biometricCapture',
          label: 'Biometric Capture',
          key: 'biometricCapture',
          inputType: 'text',
          group: 'data',
          protected: false,
          unique: false,
          persistent: true,
          // Custom properties for intent configuration
          intentAction: 'io.idpass.bca.finger.Capture',
          intentExtras: {},
          captureEnv: 'Developer',
          capturePurpose: 'Auth',
          captureSpecVersion: '0.9.5',
          captureTimeout: 30000,
          captureAutoCapture: true,
          captureQualityThreshold: 60,
          captureFingers: ['Right_Thumb'],
          captureDeviceId: '',
          captureTransactionPrefix: 'FORMIO',
          skipPolicy: 'after_attempts',
          skipAttemptsThreshold: 3,
          skipReasonRequired: false,
          skipReasons: [],
          validate: {
            required: false,
          },
        },
        ...extend,
      )
    }

    static get builderInfo() {
      return {
        title: 'Biometric Capture',
        group: 'advanced',
        icon: 'fingerprint',
        weight: 0,
        documentation: '#',
        schema: BiometricCapture.schema(),
      }
    }

    static editForm() {
      const fingerOptions = [
        { label: 'Left Thumb', value: 'Left_Thumb' },
        { label: 'Left Index Finger', value: 'Left_IndexFinger' },
        { label: 'Left Middle Finger', value: 'Left_MiddleFinger' },
        { label: 'Left Ring Finger', value: 'Left_RingFinger' },
        { label: 'Left Little Finger', value: 'Left_LittleFinger' },
        { label: 'Right Thumb', value: 'Right_Thumb' },
        { label: 'Right Index Finger', value: 'Right_IndexFinger' },
        { label: 'Right Middle Finger', value: 'Right_MiddleFinger' },
        { label: 'Right Ring Finger', value: 'Right_RingFinger' },
        { label: 'Right Little Finger', value: 'Right_LittleFinger' },
      ]

      return {
        components: [
          {
            key: 'display',
            components: [
              {
                type: 'textfield',
                key: 'intentAction',
                label: 'Android Intent Action',
                placeholder: 'io.idpass.bca.finger.Capture',
                weight: 10,
                tooltip: 'The Android Intent Action to launch.',
              },
              {
                type: 'panel',
                title: 'Capture Parameters',
                key: 'captureParameters',
                collapsible: true,
                collapsed: false,
                components: [
                  {
                    type: 'textfield',
                    key: 'captureEnv',
                    label: 'Environment',
                    placeholder: 'Developer',
                    tooltip: 'Value used in the MOSIP capture request (env).',
                  },
                  {
                    type: 'textfield',
                    key: 'capturePurpose',
                    label: 'Purpose',
                    placeholder: 'Auth',
                    tooltip: 'Value used in the MOSIP capture request (purpose).',
                  },
                  {
                    type: 'textfield',
                    key: 'captureSpecVersion',
                    label: 'Spec Version',
                    placeholder: '0.9.5',
                  },
                  {
                    type: 'number',
                    key: 'captureTimeout',
                    label: 'Timeout (ms)',
                    placeholder: '30000',
                  },
                  {
                    type: 'checkbox',
                    key: 'captureAutoCapture',
                    label: 'Enable Auto Capture',
                  },
                  {
                    type: 'number',
                    key: 'captureQualityThreshold',
                    label: 'Quality Threshold',
                    placeholder: '60',
                    validate: {
                      min: 1,
                      max: 100,
                    },
                  },
                  {
                    type: 'textfield',
                    key: 'captureDeviceId',
                    label: 'Preferred Device ID',
                    placeholder: 'Optional',
                  },
                  {
                    type: 'textfield',
                    key: 'captureTransactionPrefix',
                    label: 'Transaction Prefix',
                    placeholder: 'FORMIO',
                  },
                  {
                    type: 'select',
                    key: 'captureFingers',
                    label: 'Fingers to Capture',
                    multiple: true,
                    data: {
                      values: fingerOptions,
                    },
                    placeholder: 'Select one or more fingers',
                    clearOnRefresh: false,
                    defaultValue: ['Right_Thumb'],
                  },
                  {
                    type: 'panel',
                    title: 'Skip Logic',
                    key: 'skipLogic',
                    collapsible: true,
                    collapsed: true,
                    components: [
                      {
                        type: 'select',
                        key: 'skipPolicy',
                        label: 'Skip Policy',
                        tooltip: 'When to allow skipping a finger capture.',
                        data: {
                          values: [
                            { label: 'Never', value: 'never' },
                            { label: 'Always', value: 'always' },
                            { label: 'After Attempts', value: 'after_attempts' },
                          ],
                        },
                        defaultValue: 'after_attempts',
                      },
                      {
                        type: 'number',
                        key: 'skipAttemptsThreshold',
                        label: 'Skip Attempts Threshold',
                        tooltip: 'Number of failed attempts before skip is allowed.',
                        defaultValue: 3,
                        customConditional: "show = row.skipPolicy === 'after_attempts';",
                      },
                      {
                        type: 'checkbox',
                        key: 'skipReasonRequired',
                        label: 'Require Skip Reason',
                        tooltip: 'If checked, the user must provide a reason when skipping.',
                        defaultValue: false,
                      },
                      {
                        type: 'tags',
                        key: 'skipReasons',
                        label: 'Predefined Skip Reasons',
                        tooltip: 'List of reasons for the user to select from.',
                        placeholder: 'Add a reason and press Enter',
                        storeas: 'array',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'textarea',
                key: 'intentExtras',
                label: 'Additional Intent Extras (JSON)',
                placeholder: '{"key": "value"}',
                weight: 50,
                tooltip: 'Optional JSON object merged into the generated extras sent to BCA.',
                input: true,
                as: 'json',
              },
            ],
          },
          { key: 'data', ignore: true },
          {
            key: 'validation',
            components: [{ key: 'unique', ignore: true }],
          },
        ],
      }
    }
  }

  class Claim169Scanner extends Field {
    static schema(...extend: any[]) {
      return Field.schema(
        {
          type: 'claim169Scanner',
          label: 'Scan Identity',
          key: 'claim169Scanner',
          inputType: 'hidden',
          protected: false,
          unique: false,
          persistent: true,
          // Custom properties
          trustedIssuers: [],
          fieldMappings: [],
          storeOriginalData: true,
          validate: {
            required: false,
          },
        },
        ...extend,
      )
    }

    static get builderInfo() {
      return {
        title: 'Claim-169 Scanner',
        group: 'advanced',
        icon: 'qrcode',
        weight: 10,
        documentation: '#',
        schema: Claim169Scanner.schema(),
      }
    }

    static editForm() {
      return {
        components: [
          {
            key: 'display',
            components: [
              {
                type: 'checkbox',
                key: 'storeOriginalData',
                label: 'Store Original Data',
                tooltip: 'If checked, the full verified identity data will be stored in this field.',
                defaultValue: true,
              },
              {
                type: 'panel',
                title: 'Trusted Issuers',
                key: 'trustedIssuersPanel',
                collapsible: true,
                collapsed: false,
                components: [
                  {
                    type: 'datagrid',
                    key: 'trustedIssuers',
                    label: 'Trusted Issuers',
                    addAnother: 'Add Issuer',
                    components: [
                      {
                        type: 'textfield',
                        key: 'issuerId',
                        label: 'Issuer ID',
                        placeholder: 'https://identity.example.org',
                        tooltip: 'The issuer identifier from the Claim-169 QR code (usually a URL)',
                        validate: { required: true },
                      },
                      {
                        type: 'textarea',
                        key: 'ed25519Key',
                        label: 'Ed25519 Public Key (Base64)',
                        tooltip: 'Base64-encoded 32-byte Ed25519 public key',
                        rows: 2,
                      },
                      {
                        type: 'textarea',
                        key: 'es256Key',
                        label: 'ES256 Public Key (Base64)',
                        tooltip: 'Base64-encoded ES256/P-256 public key',
                        rows: 2,
                      },
                    ],
                  },
                ],
              },
              {
                type: 'panel',
                title: 'Field Mappings',
                key: 'fieldMappingsPanel',
                collapsible: true,
                collapsed: false,
                components: [
                  {
                    type: 'datagrid',
                    key: 'fieldMappings',
                    label: 'Map Identity Fields to Form',
                    addAnother: 'Add Mapping',
                    components: [
                      {
                        type: 'select',
                        key: 'claimField',
                        label: 'Identity Field',
                        data: {
                          values: [
                            { label: 'Full Name', value: 'fullName' },
                            { label: 'First Name', value: 'firstName' },
                            { label: 'Last Name', value: 'lastName' },
                            { label: 'Date of Birth', value: 'dateOfBirth' },
                            { label: 'Gender', value: 'gender' },
                            { label: 'Nationality', value: 'nationality' },
                            { label: 'Address', value: 'address' },
                            { label: 'Phone', value: 'phone' },
                            { label: 'Email', value: 'email' },
                            { label: 'Photo', value: 'photo' },
                            { label: 'ID', value: 'id' },
                          ],
                        },
                        validate: { required: true },
                      },
                      {
                        type: 'textfield',
                        key: 'formField',
                        label: 'Form Field Key',
                        placeholder: 'firstName',
                        tooltip: 'The key of the form component to populate.',
                        validate: { required: true },
                      },
                      {
                        type: 'checkbox',
                        key: 'overwrite',
                        label: 'Overwrite',
                        tooltip: 'Overwrite existing value if present.',
                        defaultValue: true,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { key: 'data', ignore: true },
          {
            key: 'validation',
            components: [{ key: 'unique', ignore: true }],
          },
        ],
      }
    }
  }

  Components.addComponent('biometricCapture', BiometricCapture)
  Components.addComponent('claim169Scanner', Claim169Scanner)

  // Append the "Inji Verification" tab to every input field's settings.
  injectInjiTab(Components)

  registered = true
}
