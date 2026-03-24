#!/usr/bin/env bun
/**
 * Scaffold a new CanvaFlow external plugin.
 *
 * Usage:
 *   bun run scripts/create-plugin.ts <plugin-id> [plugin-name]
 *
 * Example:
 *   bun run scripts/create-plugin.ts my-tool "My Tool"
 *
 * Creates the plugin in ~/.canvaflow/plugins/<plugin-id>/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const pluginId = process.argv[2]
const pluginName = process.argv[3] || pluginId

if (!pluginId) {
  console.error('Usage: bun run scripts/create-plugin.ts <plugin-id> [plugin-name]')
  console.error('Example: bun run scripts/create-plugin.ts my-tool "My Tool"')
  process.exit(1)
}

if (!/^[a-z0-9-]+$/.test(pluginId)) {
  console.error('Plugin ID must be lowercase alphanumeric with hyphens only')
  process.exit(1)
}

const pluginsDir = join(homedir(), '.canvaflow', 'plugins')
const targetDir = join(pluginsDir, pluginId)

if (existsSync(targetDir)) {
  console.error(`Plugin directory already exists: ${targetDir}`)
  process.exit(1)
}

const templateDir = join(__dirname, '..', 'templates', 'plugin-template')

// Copy template
mkdirSync(targetDir, { recursive: true })
cpSync(templateDir, targetDir, { recursive: true })

// Replace placeholders in all files
const filesToProcess = [
  'manifest.json',
  'src/renderer.tsx',
  'src/main.ts',
  'build.ts',
]

for (const file of filesToProcess) {
  const filePath = join(targetDir, file)
  if (!existsSync(filePath)) continue
  let content = readFileSync(filePath, 'utf-8')
  content = content.replace(/\{\{PLUGIN_ID\}\}/g, pluginId)
  content = content.replace(/\{\{PLUGIN_NAME\}\}/g, pluginName)
  writeFileSync(filePath, content, 'utf-8')
}

console.log(`\nCreated plugin: ${targetDir}\n`)
console.log('Next steps:')
console.log(`  1. cd ${targetDir}`)
console.log('  2. Edit src/renderer.tsx with your React component')
console.log('  3. (Optional) Edit src/main.ts for main process IPC handlers')
console.log('  4. bun install esbuild (if not installed globally)')
console.log('  5. bun run build.ts')
console.log('  6. Restart CanvaFlow — your plugin will appear in the context menu')
