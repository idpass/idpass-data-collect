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
 * Detect if the app is running on mobile or web platform
 * @returns 'mobile' | 'web'
 */
export function detectPlatform(): 'mobile' | 'web' {
  // Check if running in Capacitor (mobile app)
  if (window.Capacitor?.isNativePlatform?.()) {
    return 'mobile'
  }

  // Check for Cordova/PhoneGap
  if (window.cordova || window.PhoneGap || window.phonegap) {
    return 'mobile'
  }

  // Default to web
  return 'web'
}
// Extend Window interface for mobile platform detection
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean
    }
    cordova?: unknown
    PhoneGap?: unknown
    phonegap?: unknown
  }
}
