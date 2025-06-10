import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'child_process'
import vue from '@vitejs/plugin-vue'

// Get git info
const getGitInfo = () => {
  try {
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
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~bootstrap': resolve(__dirname, 'node_modules/bootstrap')
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

  // Optimize for offline usage
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
        // Ensure a single entry point
        entryFileNames: 'app.js',
        // Put all assets in the same directory
        assetFileNames: 'assets/[name][extname]',
        // Disable chunk splitting
        chunkFileNames: '[name].js'
      }
    },
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    sourcemap: 'inline'
  }
})
