import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@idpass/data-collect-core': resolve(__dirname, '../datacollect/src/browser.ts'),
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
    host: true, // Listen on all addresses
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.up.railway.app', // Railway
      '.ts.net', // Tailscale
    ],
    // Proxy OpenSPP V2 API to avoid CORS when testing against localhost:8069
    // In Docker: use OPENSPP_PROXY_TARGET env var (e.g., http://openspp:8069)
    // On host: defaults to http://localhost:8069
    proxy: {
      '/api/openspp-proxy': {
        target: process.env.OPENSPP_PROXY_TARGET || 'http://localhost:8069',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openspp-proxy/, ''),
        secure: false,
      },
    },
  },
})
