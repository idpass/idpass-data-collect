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
// Static imports are safe because the components' getField() accessors
// fall back to an empty base class when Formio.Components is not yet ready.
// The mobile production build uses inlineDynamicImports which flattens
// dynamic import() into synchronous references, so dynamic imports cannot
// be used here to defer module evaluation.
import BiometricCapture from './components/BiometricCapture';
import Claim169Scanner from './components/Claim169Scanner';
import { applyInjiVerifiableDecoration } from './components/injiVerifiable';

export async function registerCustomComponents() {
  if (Formio?.Components?.addComponent) {
    Formio.Components.addComponent('biometricCapture', BiometricCapture);
    Formio.Components.addComponent('claim169Scanner', Claim169Scanner);
    // Decorate stock fields marked with properties.injiTemplate (no new type).
    applyInjiVerifiableDecoration();
  }
}
