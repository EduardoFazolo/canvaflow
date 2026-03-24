/**
 * Build script for a CanvaFlow external plugin.
 * Run: bun run build.ts
 *
 * Produces:
 *   dist/renderer.js  — CommonJS bundle for the renderer (React component)
 *   dist/main.js      — CommonJS bundle for the main process (IPC handlers)
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
