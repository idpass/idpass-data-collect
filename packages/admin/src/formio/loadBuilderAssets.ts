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

// Side-effect import: Vite bundles and emits the Form.io builder CSS as a
// hashed asset linked from the chunk that imports this module. The CSS is
// only included in chunks that need the builder, so admin views that never
// import this module pay no cost. Replaces the previous broken
// `new URL('@formio/js/dist/formio.full.min.css', import.meta.url)` pattern,
// which does not resolve bare specifiers at build time.
import '@formio/js/dist/formio.full.min.css'

// Phase A concession: Form.io's builder UI also needs Bootstrap 4 + Font
// Awesome 4 glyphs for layout. They are still loaded from CDN to match the
// versions used by packages/admin/public/formio-builder.html. Scoping +
// bundling these is deferred to Phase B (#1059). No fallback if CDN is
// unreachable — same failure mode as the current iframe.
const BUILDER_STYLESHEETS = [
  'https://cdn.jsdelivr.net/npm/bootstrap@4.6.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.css',
] as const

let injected = false

/**
 * Inject the Form.io builder runtime stylesheets (BS4 + FA4) as `<link>` tags
 * in `document.head`. Idempotent within a module instance — safe to call from
 * every builder mount.
 */
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
