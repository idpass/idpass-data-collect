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

import '@mdi/font/css/materialdesignicons.css'
import './assets/main.css'
import 'vuetify/styles'
import { createApp, watch, isRef } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useAuthStore } from './stores/auth'
import { initializeApi } from './api'

const app = createApp(App)
const pinia = createPinia()

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1565C0',
          secondary: '#42A5F5',
          accent: '#FF6F00',
          error: '#D32F2F',
          warning: '#F57C00',
          info: '#0288D1',
          success: '#388E3C',
        },
      },
    },
  },
})

app.use(pinia)
app.use(vuetify)
app.use(router)
app.use(i18n)

// UX C5: Sync html lang attribute with i18n locale
const locale = i18n.global.locale
if (isRef(locale)) {
  watch(
    locale,
    (newLocale: string) => {
      document.documentElement.lang = newLocale
    },
    { immediate: true },
  )
}

// Initialize auth and API after pinia is registered
const authStore = useAuthStore()
authStore.initialize()
initializeApi()

app.mount('#app')
