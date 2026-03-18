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
 * Eager re-export of @aparajita/capacitor-secure-storage.
 *
 * The original plugin uses `registerPlugin('SecureStorage', { android: async () => import('./native') })`
 * which relies on dynamic imports. When Vite's `inlineDynamicImports: true` flattens the bundle
 * into a single file, the lazy module reference becomes a `let` binding that hasn't been
 * initialized yet (ReferenceError: Cannot access 'Nme' before initialization).
 *
 * This shim eagerly imports the native and web implementations so they're available
 * synchronously when registerPlugin resolves the platform loader.
 */

import { registerPlugin } from '@capacitor/core'
import type { SecureStoragePlugin } from '@aparajita/capacitor-secure-storage'

// Eager imports — these will be hoisted into the single bundle
import { SecureStorageWeb } from '@aparajita/capacitor-secure-storage/dist/esm/web'
import { SecureStorageNative } from '@aparajita/capacitor-secure-storage/dist/esm/native'

const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage', {
  web: async () => new SecureStorageWeb(),
  ios: async () => new SecureStorageNative(SecureStorage),
  android: async () => new SecureStorageNative(SecureStorage),
})

export { SecureStorage }
export type { SecureStoragePlugin }
