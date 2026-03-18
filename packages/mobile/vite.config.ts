import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'child_process'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import fs from 'fs'

// Get git info
const getGitInfo = () => {
  try {
    // Check if .git directory exists
    const isGitRepo = fs.existsSync(resolve(__dirname, '.git'))
    if (!isGitRepo) {
      console.warn('Not a git repository. Returning default git info.')
      return { commitTitle: 'unknown', commitHash: 'unknown' }
    }

    // Check if git command is available
    execSync('git --version', { stdio: 'ignore' })

    const commitTitle = execSync('git log -1 --pretty=%s').toString().trim()
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
    return { commitTitle, commitHash }
  } catch (error) {
    console.error('Error getting git info:', error)
    return { commitTitle: 'unknown', commitHash: 'unknown' }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~bootstrap': resolve(__dirname, 'node_modules/bootstrap'),
      '@idpass/data-collect-core': resolve(__dirname, '../datacollect/src/browser.ts'),
    }
  },

  server: {
    hmr: {
      overlay: false
    }
  },

  define: {
    __GIT_COMMIT_TITLE__: JSON.stringify(getGitInfo().commitTitle),
    __GIT_COMMIT_HASH__: JSON.stringify(getGitInfo().commitHash)
  },

  // Optimize for offline usage — Capacitor loads from local file:// so all
  // chunks are available offline. We allow minimal code splitting because
  // inlineDynamicImports: true breaks plugins that use registerPlugin() with
  // lazy platform loaders (e.g. @aparajita/capacitor-secure-storage).
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: '[name].js'
      }
    },
    cssCodeSplit: false,
    sourcemap: 'inline'
  }
})
