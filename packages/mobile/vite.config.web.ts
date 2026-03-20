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

import { defineConfig, mergeConfig } from 'vite'
import { resolve } from 'path'
import baseConfig from './vite.config'

export default mergeConfig(baseConfig, defineConfig({
  resolve: {
    alias: {
      '@capacitor-mlkit/barcode-scanning':
        resolve(__dirname, 'src/platform/stubs/barcode-scanning.ts'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Web builds do not need inlineDynamicImports — that constraint is
        // Capacitor file:// specific. Dropping it enables code splitting and
        // faster HMR rebuilds.
        inlineDynamicImports: false,
        manualChunks: undefined,
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    },
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    sourcemap: true,
  }
}))
