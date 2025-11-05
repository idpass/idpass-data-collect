import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Remove the global Bootstrap SCSS import
  css: {
    preprocessorOptions: {
      scss: {
        // additionalData: `@import "bootstrap/scss/bootstrap";`,
      },
    },
  },
  server: {
    // Allow Railway domains and localhost for development
    host: true, // Listen on all addresses
    allowedHosts: [
      '.up.railway.app',
      'localhost',
      '127.0.0.1',
    ],
  },
})
