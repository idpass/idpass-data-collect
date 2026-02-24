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

import { Geolocation } from '@capacitor/geolocation'
import type { CapturedLocation } from '@idpass/data-collect-core'
import { detectPlatform } from './device'

const TIMEOUT_MS = 10_000

/**
 * Get the current GPS position as a CapturedLocation.
 *
 * Uses Capacitor Geolocation on mobile platforms and the browser
 * Geolocation API on web. Returns null on any failure — this function
 * never throws.
 *
 * Uses one-shot `getCurrentPosition` (not continuous `watchPosition`)
 * to minimize battery drain on budget Android devices.
 */
export async function getCurrentPosition(): Promise<CapturedLocation | null> {
  try {
    const platform = detectPlatform()
    if (platform === 'mobile') {
      return await getMobilePosition()
    }
    return await getWebPosition()
  } catch {
    return null
  }
}

async function getMobilePosition(): Promise<CapturedLocation | null> {
  const permissions = await Geolocation.checkPermissions()
  if (permissions.location !== 'granted') {
    const requested = await Geolocation.requestPermissions()
    if (requested.location !== 'granted') {
      return null
    }
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: TIMEOUT_MS,
  })

  return coordsToCapturedLocation(position.coords, position.timestamp)
}

function getWebPosition(): Promise<CapturedLocation | null> {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(coordsToCapturedLocation(position.coords, position.timestamp))
      },
      () => {
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
      },
    )
  })
}

function coordsToCapturedLocation(
  coords: { latitude: number; longitude: number; accuracy: number | null; altitude: number | null; altitudeAccuracy: number | null; speed: number | null; heading: number | null },
  timestamp: number,
): CapturedLocation {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? undefined,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    speed: coords.speed,
    heading: coords.heading,
    capturedAt: new Date(timestamp).toISOString(),
  }
}
