import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

export default defineConfig({
  plugins: [vue() as Plugin],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~bootstrap': resolve(__dirname, 'node_modules/bootstrap'),
      '@idpass/data-collect-core': resolve(__dirname, '../datacollect/src')
    }
  },
  define: {
    __GIT_COMMIT_TITLE__: JSON.stringify('test'),
    __GIT_COMMIT_HASH__: JSON.stringify('test')
  }
}) 
