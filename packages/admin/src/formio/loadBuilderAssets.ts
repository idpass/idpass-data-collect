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

// Phase A concession: Form.io's builder UI needs Bootstrap 4 + Font Awesome 4
// glyphs alongside the Form.io stylesheet. They are loaded lazily on first
// builder mount and remain in the document for the rest of the app lifetime —
// scoping is deferred to Phase B (#1059).
const BUILDER_STYLESHEETS = [
  // Form.io ships its CSS bundled in dist/.
  new URL('@formio/js/dist/formio.full.min.css', import.meta.url).href,
  // Bootstrap 4 and Font Awesome 4 are still loaded from CDN to match
  // packages/admin/public/formio-builder.html one-for-one. Phase B will
  // replace these with scoped bundled assets.
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css',
] as const

let injected = false

export function loadBuilderAssets(): void {
  if (injected) return
  for (const href of BUILDER_STYLESHEETS) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.formioBuilderAsset = 'true'
    document.head.appendChild(link)
  }
  injected = true
}

// Test-only reset hook.
export function __resetForTests(): void {
  injected = false
}
