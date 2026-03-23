import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
  plugins: [vue(), vuetify({ autoImport: true }), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
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
    __GIT_COMMIT_HASH__: JSON.stringify(getGitInfo().commitHash),
    __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version)
  },

  // Optimize for offline usage — single bundle for Capacitor file:// loading.
  // inlineDynamicImports is required because RxJS/RxDB use CJS-style IIFEs
  // that break when Rollup reorders modules across chunks.
  // The @aparajita/capacitor-secure-storage plugin uses registerPlugin() with
  // lazy dynamic imports that break when inlined. We pre-resolve the native
  // module reference via a manual chunk to avoid the circular init issue.
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: '[name].js'
      }
    },
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    sourcemap: 'inline'
  }
})
