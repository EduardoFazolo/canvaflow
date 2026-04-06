import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/**
 * Vite/Rollup plugin that inlines chunk imports into preload entry files.
 * Webview preloads run in isolated Electron contexts where require() for
 * sibling chunks can fail. This plugin embeds chunk code directly.
 */
function inlinePreloadChunksPlugin(): Plugin {
  return {
    name: 'inline-preload-chunks',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunksByFile = new Map<string, import('rollup').OutputChunk>()
      for (const b of Object.values(bundle)) {
        if (b.type === 'chunk' && !b.isEntry) chunksByFile.set(b.fileName, b)
      }
      if (chunksByFile.size === 0) return

      for (const entry of Object.values(bundle)) {
        if (entry.type !== 'chunk' || !entry.isEntry) continue
        for (const [fileName, chunk] of chunksByFile) {
          // Match require("./chunks/foo.js") or require("./foo.js")
          const patterns = [
            `require("./${fileName}")`,
            `require("./chunks/${fileName.replace(/^chunks\//, '')}")`,
          ]
          for (const pat of patterns) {
            if (!entry.code.includes(pat)) continue
            // Wrap chunk as an IIFE that returns its exports
            const iife = [
              '(function() {',
              '  var module = { exports: {} };',
              '  var exports = module.exports;',
              chunk.code,
              '  return module.exports;',
              '})()',
            ].join('\n')
            entry.code = entry.code.replace(pat, iife)
          }
        }
      }

      // Remove chunks that are no longer referenced
      for (const fileName of chunksByFile.keys()) {
        let stillReferenced = false
        for (const b of Object.values(bundle)) {
          if (b.type === 'chunk' && b.code.includes(fileName)) {
            stillReferenced = true
            break
          }
        }
        if (!stillReferenced) delete bundle[fileName]
      }
    },
  }
}

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
    plugins: [externalizeDepsPlugin(), inlinePreloadChunksPlugin()],
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
