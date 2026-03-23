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

import { ref, onUnmounted } from 'vue'
import { BarcodeScanner, type Barcode } from '@capacitor-mlkit/barcode-scanning'
import { Camera } from '@capacitor/camera'
import { App as CapacitorApp } from '@capacitor/app'
import { PlatformService } from '@/platform'

export interface ScanOptions {
  handleBackButton?: boolean
}

export function useBarcodeScan() {
  const isScanning = ref(false)
  let activeListener: { remove: () => Promise<void> } | null = null
  let backButtonListener: { remove: () => Promise<void> } | null = null
  let cancelFn: (() => void) | null = null

  const requestPermissions = async (): Promise<boolean> => {
    if (!PlatformService.isNative) return true
    const { camera } = await Camera.requestPermissions()
    return camera === 'granted' || camera === 'limited'
  }

  const cleanup = async () => {
    document.querySelector('body')?.classList.remove('barcode-scanner-active')
    isScanning.value = false
    cancelFn = null
    await BarcodeScanner.stopScan().catch(() => {})
    if (activeListener) {
      await activeListener.remove().catch(() => {})
      activeListener = null
    }
    if (backButtonListener) {
      await backButtonListener.remove().catch(() => {})
      backButtonListener = null
    }
  }

  const scanBarcode = (options?: ScanOptions): Promise<Barcode> => {
    return new Promise((resolve, reject) => {
      document.querySelector('body')?.classList.add('barcode-scanner-active')
      isScanning.value = true

      cancelFn = async () => {
        await cleanup()
        reject(new Error('Scan cancelled'))
      }

      if (options?.handleBackButton) {
        CapacitorApp.addListener('backButton', async () => {
          await cleanup()
          reject(new Error('Scan cancelled'))
        }).then((listener) => {
          backButtonListener = listener
        })
      }

      BarcodeScanner.addListener('barcodeScanned', async (result) => {
        try {
          await cleanup()
          resolve(result.barcode)
        } catch (error) {
          reject(error)
        }
      })
        .then((listener) => {
          activeListener = listener
          void BarcodeScanner.startScan().catch(async (error) => {
            await cleanup()
            reject(error)
          })
        })
        .catch(async (error) => {
          await cleanup()
          reject(error)
        })
    })
  }

  const cancelScan = async () => {
    if (cancelFn) cancelFn()
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    isScanning,
    requestPermissions,
    cleanup,
    scanBarcode,
    cancelScan,
  }
}
