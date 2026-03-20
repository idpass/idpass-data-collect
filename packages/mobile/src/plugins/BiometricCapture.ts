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

import { registerPlugin } from '@capacitor/core';

export interface CaptureResult {
  responseData?: string;
  responseDataData?: string;
  fingerprintImages?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface BiometricCapturePlugin {
  launchCapture(options: {
    action: string;
    extras?: Record<string, string | number | boolean>;
  }): Promise<{ result: CaptureResult }>;
}

const BiometricCapture = registerPlugin<BiometricCapturePlugin>('BiometricCapture', {
  web: {
    launchCapture: async (options: { action: string; extras?: Record<string, string | number | boolean> }) => {
      await new Promise(resolve => setTimeout(resolve, 800))

      let fingers: string[] = ['Right_Thumb']
      try {
        const req = JSON.parse((options.extras?.request as string) || '{}')
        if (Array.isArray(req.fingers) && req.fingers.length > 0) fingers = req.fingers
      } catch { /* ignore parse errors */ }

      const biometrics = fingers.map((f) => ({
        bioSubType: f,
        qualityScore: 75,
        bioValue: 'MOCK_TEMPLATE_DATA',
        error: null,
      }))

      // Minimal 1x1 grey PNG as a stand-in fingerprint preview
      const MOCK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const fingerprintImages: Record<string, string> = {}
      fingers.forEach((f) => { fingerprintImages[f] = MOCK_PNG })

      return {
        result: {
          responseData: JSON.stringify({ biometrics }),
          fingerprintImages: JSON.stringify(fingerprintImages),
        }
      }
    }
  }
});

export default BiometricCapture;
