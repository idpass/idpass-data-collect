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

import type { CapturedLocation } from '@idpass/data-collect-core'
import { ref } from 'vue'
import { getCurrentPosition } from '@/utils/geolocation'
import { shouldCaptureLocation } from '@/utils/locationConfig'
import type { Config, EntityForm } from '@/utils/dynamicFormIoUtils'

export type LocationStatus = 'idle' | 'acquiring' | 'locked' | 'failed'

function disclosureKey(tenantId: string): string {
  return `locationDisclosureShown_${tenantId}`
}

/**
 * Composable that manages GPS location capture for form views.
 *
 * Handles the full lifecycle: config check, disclosure prompt,
 * GPS acquisition, and metadata attachment on submit.
 */
export function useLocationCapture(tenantId: string) {
  const pendingLocation = ref<CapturedLocation | null>(null)
  const locationStatus = ref<LocationStatus>('idle')
  const showDisclosure = ref(false)
  let locationPromise: Promise<CapturedLocation | null> | null = null

  async function startCapture() {
    locationStatus.value = 'acquiring'
    locationPromise = getCurrentPosition()
    const location = await locationPromise
    locationPromise = null
    pendingLocation.value = location
    locationStatus.value = location ? 'locked' : 'failed'
  }

  function onDisclosureAcknowledged() {
    showDisclosure.value = false
    localStorage.setItem(disclosureKey(tenantId), 'true')
    startCapture()
  }

  /**
   * Call from onMounted after tenant and entity form are loaded.
   * Checks config, shows disclosure if needed, then starts GPS.
   */
  function initIfEnabled(tenantConfig: Config, entityForm: EntityForm) {
    if (!shouldCaptureLocation(tenantConfig, entityForm)) return

    const disclosed = localStorage.getItem(disclosureKey(tenantId))
    if (!disclosed) {
      showDisclosure.value = true
    } else {
      startCapture()
    }
  }

  /**
   * Resolve the captured location for attachment to a FormSubmission.
   * If GPS is still acquiring, awaits the in-flight request rather
   * than silently dropping the location.
   */
  async function resolveLocation(): Promise<CapturedLocation | null> {
    if (locationPromise) {
      return await locationPromise
    }
    return pendingLocation.value
  }

  return {
    pendingLocation,
    locationStatus,
    showDisclosure,
    startCapture,
    onDisclosureAcknowledged,
    initIfEnabled,
    resolveLocation,
  }
}
