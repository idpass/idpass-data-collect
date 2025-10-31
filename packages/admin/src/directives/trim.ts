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

import type { ObjectDirective } from 'vue'

/**
 * Custom Vue directive that automatically trims text input values on blur.
 * Prevents RxDB primary key issues caused by trailing/leading spaces.
 *
 * Usage:
 * ```vue
 * <v-text-field v-model="form.name" v-trim />
 * ```
 */
export const trimDirective: ObjectDirective<HTMLElement> = {
  mounted(el: HTMLElement) {
    const findInput = (): HTMLInputElement | null => {
      return el.querySelector('input') || (el.tagName === 'INPUT' ? (el as HTMLInputElement) : null)
    }

    const trimValue = () => {
      const input = findInput()
      if (!input) return

      const trimmed = input.value.trim()
      if (trimmed !== input.value) {
        input.value = trimmed
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    // Try to attach immediately, or wait a bit for Vuetify to render
    const attachListener = () => {
      const input = findInput()
      if (input) {
        input.addEventListener('blur', trimValue)
        ;(el as any).__trimHandler = trimValue
      } else {
        // Retry once if input not found (for async Vuetify rendering)
        setTimeout(attachListener, 50)
      }
    }

    attachListener()
  },

  unmounted(el: HTMLElement) {
    const input = el.querySelector('input') || (el.tagName === 'INPUT' ? (el as HTMLInputElement) : null)
    const handler = (el as any).__trimHandler

    if (input && handler) {
      input.removeEventListener('blur', handler)
    }
  },
}

