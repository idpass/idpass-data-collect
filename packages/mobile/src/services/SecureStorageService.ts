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

import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@/shims/secure-storage'

/**
 * Thin wrapper around native secure storage with a web fallback.
 *
 * On native platforms (iOS/Android):
 *   - iOS: values are stored in the Keychain with kSecAttrAccessibleAfterFirstUnlock
 *     accessibility, meaning they survive device restarts and are hardware-backed
 *     on devices with Secure Enclave.
 *   - Android: values are stored in EncryptedSharedPreferences backed by the
 *     Android Keystore, which uses hardware-backed key storage on devices with
 *     a Trusted Execution Environment (TEE) or StrongBox.
 *
 * On web/dev: falls back to localStorage (same behaviour as before this change).
 * This fallback is intentional for local development only and must never be
 * used in production native builds.
 */
export const SecureStorageService = {
  async get(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return localStorage.getItem(key)
    }
    try {
      // getItem returns the raw string value, unlike get() which parses JSON
      return await SecureStorage.getItem(key)
    } catch {
      return null
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(key, value)
      return
    }
    // setItem stores the raw string without JSON serialization
    await SecureStorage.setItem(key, value)
  },

  async remove(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(key)
      return
    }
    try {
      await SecureStorage.remove(key)
    } catch {
      // Key may not exist; treat as no-op
    }
  },

  async clear(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.clear()
      return
    }
    await SecureStorage.clear()
  }
}
