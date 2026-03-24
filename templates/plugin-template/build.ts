/**
 * Build script for a CanvaFlow external plugin.
 * Run: bun run build.ts
 *
 * Produces:
 *   dist/renderer.js  — CommonJS bundle for the renderer (React component)
 *   dist/main.js      — CommonJS bundle for the main process (IPC handlers)
 *
 * Dependencies:
 *   All npm packages your plugin uses are bundled into the output files.
 *   Just `bun add <package>` and import it — esbuild includes it automatically.
 *
 *   The only externals (provided by the host, not bundled) are:
 *     Renderer: react, react-dom, zustand
 *     Main:     electron
 *
 *   Native Node modules (better-sqlite3, sharp, etc.) cannot be used in the
 *   renderer bundle. If you need native functionality, put it in src/main.ts
 *   and call it from the renderer via window.pluginIpc.invoke().
 */

import { build } from 'esbuild'

const common = {
  bundle: true,
  format: 'cjs' as const,
  target: 'es2022',
  minify: false,
  sourcemap: true,
}

// Renderer bundle — React is provided by the host
await build({
  ...common,
  entryPoints: ['src/renderer.tsx'],
  outfile: 'dist/renderer.js',
  external: ['react', 'react-dom', 'zustand'],
  platform: 'browser',
})

// Main process bundle (optional — remove if your plugin has no main process code)
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  platform: 'node',
  external: ['electron'],
})

console.log('Build complete → dist/')
