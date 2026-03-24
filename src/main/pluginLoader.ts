import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createRequire } from 'module'
import type { IpcMainLike, PluginManifest, LoadedPluginInfo } from '../plugins/types'
import { createScopedIpc } from './pluginIpcRouter'

// Use Node's createRequire to get a real require() that survives Vite/Rollup bundling.
// The bundler transforms bare `require()` calls, but createRequire produces a function
// at runtime that works with absolute paths outside the asar archive.
const nativeRequire = createRequire(__filename)

const PLUGINS_DIR = join(homedir(), '.canvaflow', 'plugins')

const loadedPlugins = new Map<string, LoadedPluginInfo>()

/**
 * Validate that a manifest has the required fields.
 */
function validateManifest(obj: unknown): obj is PluginManifest {
  if (!obj || typeof obj !== 'object') return false
  const m = obj as Record<string, unknown>
  return (
    typeof m.id === 'string' && m.id.length > 0 &&
    typeof m.name === 'string' &&
    typeof m.version === 'string' &&
    typeof m.nodeType === 'string' && m.nodeType.length > 0 &&
    typeof m.renderer === 'string' &&
    typeof m.defaultTitle === 'string' &&
    m.defaultSize != null && typeof m.defaultSize === 'object' &&
    typeof (m.defaultSize as Record<string, unknown>).width === 'number' &&
    typeof (m.defaultSize as Record<string, unknown>).height === 'number'
  )
}

/**
 * Read the enabled state for a plugin. Defaults to true.
 */
function isPluginEnabled(pluginDir: string): boolean {
  const enabledFile = join(pluginDir, '.enabled')
  if (!existsSync(enabledFile)) return true
  try {
    return readFileSync(enabledFile, 'utf-8').trim() !== 'false'
  } catch {
    return true
  }
}

/**
 * Persist the enabled/disabled state for a plugin.
 */
function setPluginEnabled(pluginDir: string, enabled: boolean): void {
  writeFileSync(join(pluginDir, '.enabled'), enabled ? 'true' : 'false', 'utf-8')
}

/**
 * Scan ~/.canvaflow/plugins/ and load all valid plugin main-process bundles.
 */
export async function loadAllPlugins(ipcMain: IpcMainLike): Promise<Map<string, LoadedPluginInfo>> {
  // Ensure plugins directory exists
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true })
    return loadedPlugins
  }

  let entries: string[]
  try {
    entries = readdirSync(PLUGINS_DIR)
  } catch (err) {
    console.error('[pluginLoader] Failed to read plugins directory:', err)
    return loadedPlugins
  }

  for (const entry of entries) {
    const pluginDir = join(PLUGINS_DIR, entry)

    // Skip non-directories
    try {
      if (!statSync(pluginDir).isDirectory()) continue
    } catch {
      continue
    }

    const manifestPath = join(pluginDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      console.warn(`[pluginLoader] Skipping ${entry}: no manifest.json`)
      continue
    }

    let manifest: PluginManifest
    try {
      const raw = readFileSync(manifestPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!validateManifest(parsed)) {
        throw new Error('Invalid manifest schema')
      }
      manifest = parsed
    } catch (err) {
      console.error(`[pluginLoader] Failed to parse manifest for ${entry}:`, err)
      loadedPlugins.set(entry, {
        manifest: { id: entry, name: entry, version: '0.0.0', nodeType: entry, renderer: '', defaultSize: { width: 600, height: 400 }, defaultTitle: entry },
        path: pluginDir,
        enabled: false,
        error: `Invalid manifest: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }

    const enabled = isPluginEnabled(pluginDir)

    const info: LoadedPluginInfo = {
      manifest,
      path: pluginDir,
      enabled,
    }

    // Load main process bundle if present and plugin is enabled
    if (enabled && manifest.main) {
      const mainBundlePath = join(pluginDir, manifest.main)
      if (existsSync(mainBundlePath)) {
        try {
          const scopedIpc = createScopedIpc(manifest.id, ipcMain)
          const mainModule = nativeRequire(mainBundlePath)
          const registerFn = mainModule.registerMainHandlers ?? mainModule.default?.registerMainHandlers
          if (typeof registerFn === 'function') {
            registerFn(scopedIpc)
          }
          console.log(`[pluginLoader] Loaded main bundle for ${manifest.id}`)
        } catch (err) {
          console.error(`[pluginLoader] Failed to load main bundle for ${manifest.id}:`, err)
          info.error = `Main bundle error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }

    // Register preload path handlers
    if (manifest.preloadScripts) {
      for (let i = 0; i < manifest.preloadScripts.length; i++) {
        const absPath = join(pluginDir, manifest.preloadScripts[i])
        const scopedIpc = createScopedIpc(manifest.id, ipcMain)
        scopedIpc.handle(`preloadPath:${i}`, () => absPath)
      }
    }

    loadedPlugins.set(manifest.id, info)
  }

  console.log(`[pluginLoader] Loaded ${loadedPlugins.size} external plugin(s)`)
  return loadedPlugins
}

/**
 * Get all loaded plugin info (for the plugin manager UI).
 */
export function getLoadedPlugins(): Map<string, LoadedPluginInfo> {
  return loadedPlugins
}

/**
 * Enable or disable a plugin. Takes effect on next app restart.
 */
export function setPluginEnabledState(pluginId: string, enabled: boolean): void {
  const info = loadedPlugins.get(pluginId)
  if (!info) return
  setPluginEnabled(info.path, enabled)
  info.enabled = enabled
}

/**
 * Register IPC handlers for plugin management (called from main/index.ts).
 */
export function setupPluginHandlers(ipcMain: IpcMainLike): void {
  ipcMain.handle('plugins:getAll', () => {
    return Array.from(loadedPlugins.entries()).map(([id, info]) => ({
      id,
      ...info.manifest,
      enabled: info.enabled,
      error: info.error,
      path: info.path,
    }))
  })

  ipcMain.handle('plugins:setEnabled', (_event: unknown, pluginId: string, enabled: boolean) => {
    setPluginEnabledState(pluginId, enabled)
  })

  ipcMain.handle('plugins:getRendererBundle', (_event: unknown, pluginId: string) => {
    const info = loadedPlugins.get(pluginId)
    if (!info || !info.enabled) return null
    const bundlePath = join(info.path, info.manifest.renderer)
    if (!existsSync(bundlePath)) return null
    try {
      return readFileSync(bundlePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('plugins:getDir', () => PLUGINS_DIR)
}
