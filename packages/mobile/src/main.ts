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

declare global {
  interface Window {
    __showError?: (title: string, msg: string, source?: string) => void
  }
}

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/css/bootstrap-grid.min.css'
import 'font-awesome/css/font-awesome.min.css'
// Deps for calendar picker in Formio
import 'flatpickr-formio/dist/flatpickr.min.css'
import 'flatpickr-formio'
import 'formiojs/dist/formio.full.min.css'

import { createApp } from 'vue'
import App from './App.vue'
import DyApp from './DyApp.vue'
import { createDatabase } from './database'
import router from './router'
import './style.css'
// Bootstrap overrides for Humanitarian Tech theme - must come after Bootstrap
import './assets/css/bootstrap-overrides.css'
import { useAuthManagerStore } from './store/authManager'

import { createPinia } from 'pinia'
import { registerCustomComponents } from './formio'
import { App as CapacitorApp } from '@capacitor/app'
import { AppLockService } from './services/AppLockService'

async function initApp() {
  registerCustomComponents()
  const isFeatureDynamicTurnedOn = import.meta.env.VITE_FEATURE_DYNAMIC
  const AppComponent = isFeatureDynamicTurnedOn ? DyApp : App
  const pinia = createPinia()

  const database = await createDatabase()
  const app = createApp(AppComponent).use(database).use(pinia).use(router)

  // Set up Capacitor URL listener for OAuth callbacks
  const authManager = useAuthManagerStore()
  await authManager.setupCapacitorUrlListener()

  // Background state listener: blur UI and lock app when backgrounded.
  // NOTE (iOS): the OS takes the task-switcher screenshot before this JS event
  // fires (~100-300ms window). The CSS blur is partial protection only on iOS.
  // Full iOS protection requires a native UIView overlay — tracked as follow-up.
  CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) {
      document.body.classList.add('app-backgrounded')
      await AppLockService.lock()
    } else {
      document.body.classList.remove('app-backgrounded')
      if (AppLockService.locked.value) {
        await AppLockService.authenticate()
      }
    }
  })

  app.config.errorHandler = (err, _instance, info) => {
    const msg = err instanceof Error ? err.stack || err.message : String(err)
    window.__showError?.('Vue Error (' + info + ')', msg)
  }

  app.mount('#app')
}

initApp().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err)
  window.__showError?.('App Initialization Failed', msg)
})
