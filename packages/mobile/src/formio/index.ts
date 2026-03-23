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

export async function registerCustomComponents() {
  if (Formio?.Components?.addComponent) {
    // Dynamic imports so that these modules are evaluated only after formiojs
    // is fully initialized (their top-level code accesses Formio.Components).
    const [{ default: BiometricCapture }, { default: Claim169Scanner }] = await Promise.all([
      import('./components/BiometricCapture'),
      import('./components/Claim169Scanner'),
    ]);
    Formio.Components.addComponent('biometricCapture', BiometricCapture);
    Formio.Components.addComponent('claim169Scanner', Claim169Scanner);
  }
}
