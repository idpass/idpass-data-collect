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

// Side-effect imports: Vite bundles all builder styling into hashed assets
// linked from the chunk that imports this module, so admin views that never
// open the builder pay no cost — and nothing is fetched from a CDN (the
// Phase A concession this replaces; CDN links also leaked unscoped Bootstrap
// into the Vuetify dashboard and broke its styles).
//
// - formio.full.min.css: Form.io's own builder/dialog/choices/flatpickr styles
//   (prefixed selectors, safe to load globally).
// - font-awesome: glyphs used by Form.io component icons (.fa-* only, safe
//   globally; fonts are bundled and hashed by Vite).
// - builder-theme.scss: Bootstrap 4 compiled with ID PASS design-token
//   variables and scoped under .formio-builder-host / .formio-dialog, plus
//   the ID PASS builder chrome. See that file for the scoping rationale.
import '@formio/js/dist/formio.full.min.css'
import 'font-awesome/css/font-awesome.css'
import './builder-theme.scss'

/**
 * Kept as the single entry point the builder component calls before mounting.
 * All stylesheets are now static side-effect imports above (bundled, scoped),
 * so there is nothing left to do at runtime. Idempotent by construction.
 */
export function loadBuilderAssets(): void {
  // Intentionally empty — styling is applied via the imports above.
}
