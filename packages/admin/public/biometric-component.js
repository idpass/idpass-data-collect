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
 * Biometric Capture Component for Form.io Builder
 * 
 * This file defines the custom Biometric Capture component for the Form.io builder.
 * It is loaded by the formio-builder.html iframe.
 */

if (typeof Formio !== 'undefined') {
  const Field = Formio.Components.components.field;

  class BiometricCapture extends Field {
    static schema(...extend) {
      return Field.schema({
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

    constructor(component, options, data) {
      super(component, options, data);
    }
    
    // Configure the settings form for the builder
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
        { label: 'Right Little Finger', value: 'Right_LittleFinger' }
      ];

      const form = {
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
                tooltip: 'The Android Intent Action to launch.'
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
                    tooltip: 'Value used in the MOSIP capture request (env).'
                  },
                  {
                    type: 'textfield',
                    key: 'capturePurpose',
                    label: 'Purpose',
                    placeholder: 'Auth',
                    tooltip: 'Value used in the MOSIP capture request (purpose).'
                  },
                  {
                    type: 'textfield',
                    key: 'captureSpecVersion',
                    label: 'Spec Version',
                    placeholder: '0.9.5'
                  },
                  {
                    type: 'number',
                    key: 'captureTimeout',
                    label: 'Timeout (ms)',
                    placeholder: '30000'
                  },
                  {
                    type: 'checkbox',
                    key: 'captureAutoCapture',
                    label: 'Enable Auto Capture'
                  },
                  {
                    type: 'number',
                    key: 'captureQualityThreshold',
                    label: 'Quality Threshold',
                    placeholder: '60',
                    validate: {
                      min: 1,
                      max: 100
                    }
                  },
                  {
                    type: 'textfield',
                    key: 'captureDeviceId',
                    label: 'Preferred Device ID',
                    placeholder: 'Optional'
                  },
                  {
                    type: 'textfield',
                    key: 'captureTransactionPrefix',
                    label: 'Transaction Prefix',
                    placeholder: 'FORMIO'
                  },
                  {
                    type: 'select',
                    key: 'captureFingers',
                    label: 'Fingers to Capture',
                    multiple: true,
                    data: {
                      values: fingerOptions
                    },
                    placeholder: 'Select one or more fingers',
                    clearOnRefresh: false,
                    defaultValue: ['Right_Thumb']
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
                            { label: 'After Attempts', value: 'after_attempts' }
                          ]
                        },
                        defaultValue: 'after_attempts'
                      },
                      {
                        type: 'number',
                        key: 'skipAttemptsThreshold',
                        label: 'Skip Attempts Threshold',
                        tooltip: 'Number of failed attempts before skip is allowed.',
                        defaultValue: 3,
                        customConditional: "show = row.skipPolicy === 'after_attempts';"
                      },
                      {
                        type: 'checkbox',
                        key: 'skipReasonRequired',
                        label: 'Require Skip Reason',
                        tooltip: 'If checked, the user must provide a reason when skipping.',
                        defaultValue: false
                      },
                      {
                        type: 'tags',
                        key: 'skipReasons',
                        label: 'Predefined Skip Reasons',
                        tooltip: 'List of reasons for the user to select from.',
                        placeholder: 'Add a reason and press Enter',
                        storeas: 'array'
                      }
                    ]
                  }
                ]
              },
              {
                type: 'textarea',
                key: 'intentExtras',
                label: 'Additional Intent Extras (JSON)',
                placeholder: '{"key": "value"}',
                weight: 50,
                tooltip: 'Optional JSON object merged into the generated extras sent to BCA.',
                input: true,
                as: 'json'
              }
            ]
          },
          { key: 'data', ignore: true },
          {
            key: 'validation',
            components: [
              { key: 'unique', ignore: true }
            ]
          }
        ]
      };

      return form;
    }
  }

  // Register the component
  Formio.Components.addComponent('biometricCapture', BiometricCapture);
}
