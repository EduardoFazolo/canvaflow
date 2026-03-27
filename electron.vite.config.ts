import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['node-pty', 'better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
          notionWebview: 'src/plugins/notion/preload/notionWebview.ts',
          canvasWebview: 'src/plugins/browser/preload/canvasWebview.ts',
          trelloWebview: 'src/plugins/trello/preload/trelloWebview.ts',
          lovableWebview: 'src/plugins/lovable/preload/lovableWebview.ts',
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      exclude: ['shiki'],
    },
    server: {
      fs: {
        strict: false,
      },
    },
  }
})
