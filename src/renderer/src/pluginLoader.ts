import React from 'react'
import { pluginRegistry } from '../../plugins/types'
import type { CanvaFlowPlugin, PluginManifest } from '../../plugins/types'

/**
 * Shared dependencies provided to external plugins via a custom require() shim.
 * Plugins are built as CommonJS bundles with these as externals.
 */
const SHARED_MODULES: Record<string, unknown> = {
  react: React,
}

// Lazily populated — some modules are only available after import
let sharedModulesReady = false

async function ensureSharedModules(): Promise<void> {
  if (sharedModulesReady) return
  try {
    const ReactDOM = await import('react-dom')
    SHARED_MODULES['react-dom'] = ReactDOM
    SHARED_MODULES['react/jsx-runtime'] = await import('react/jsx-runtime')
  } catch {
    // react-dom may not be importable in all contexts
  }
  try {
    const zustand = await import('zustand')
    SHARED_MODULES['zustand'] = zustand
  } catch {
    // zustand may not be available
  }
  sharedModulesReady = true
}

/**
 * Load a single renderer bundle using new Function() with a custom require shim.
 * The bundle must be CommonJS format (esbuild default).
 *
 * Returns the plugin's default export (a CanvaFlowPlugin-like object).
 */
function loadRendererBundle(code: string, pluginId: string): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> }

  const customRequire = (dep: string): unknown => {
    const shared = SHARED_MODULES[dep]
    if (shared !== undefined) return shared
    throw new Error(
      `[CanvaFlow] Plugin "${pluginId}" tried to require "${dep}" which is not provided by the host. ` +
      `External plugins can only import: ${Object.keys(SHARED_MODULES).join(', ')}`
    )
  }

  try {
    const factory = new Function('module', 'exports', 'require', '__canvaflow__', code)
    factory(module, module.exports, customRequire, {
      pluginIpc: (window as any).pluginIpc,
      React,
    })
  } catch (err) {
    console.error(`[pluginLoader] Failed to execute renderer bundle for ${pluginId}:`, err)
    throw err
  }

  return module.exports
}

/**
 * Plugin info returned from the main process.
 */
interface ExternalPluginInfo {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  nodeType: string
  defaultSize: { width: number; height: number }
  defaultTitle: string
  keepAlive?: boolean
  sidebarLabel?: string
  shortcut?: string
  enabled: boolean
  error?: string
  path: string
}

/**
 * Load all enabled external plugins from ~/.canvaflow/plugins/.
 * Called once before React renders.
 *
 * Performance: when no external plugins are installed (the common case),
 * this does a single fast IPC call and returns immediately — no dynamic
 * imports, no Function evaluation.
 */
export async function loadExternalPlugins(): Promise<void> {
  let pluginInfos: ExternalPluginInfo[]
  try {
    pluginInfos = await (window as any).plugins.getAll()
  } catch (err) {
    console.warn('[pluginLoader] Could not fetch external plugin list:', err)
    return
  }

  // Fast path: no external plugins installed — skip all dynamic imports
  const enabledPlugins = pluginInfos?.filter((p) => p.enabled && !p.error)
  if (!enabledPlugins || enabledPlugins.length === 0) return

  // Only pay the cost of shared module initialization when we actually have plugins to load
  await ensureSharedModules()

  for (const info of enabledPlugins) {

    // Skip if already registered (built-in with same nodeType)
    if (pluginRegistry.has(info.nodeType)) {
      console.warn(`[pluginLoader] Skipping ${info.id}: nodeType "${info.nodeType}" already registered`)
      continue
    }

    try {
      // Fetch the renderer bundle code from main process
      const code: string | null = await (window as any).plugins.getRendererBundle(info.id)
      if (!code) {
        console.warn(`[pluginLoader] No renderer bundle for ${info.id}`)
        continue
      }

      const exports = loadRendererBundle(code, info.id)
      const pluginExport = (exports.default ?? exports.plugin ?? exports) as Partial<CanvaFlowPlugin>

      // The renderer bundle must export a React component
      const component = pluginExport.component
      if (!component) {
        console.error(`[pluginLoader] Plugin ${info.id} renderer bundle did not export a component`)
        continue
      }

      // Construct the full CanvaFlowPlugin from manifest + renderer export
      const plugin: CanvaFlowPlugin = {
        id: info.id,
        nodeType: info.nodeType,
        defaultSize: info.defaultSize,
        defaultTitle: info.defaultTitle,
        component: component as React.ComponentType<{ node: any }>,
        keepAlive: pluginExport.keepAlive ?? info.keepAlive ?? false,
        sidebarLabel: pluginExport.sidebarLabel ?? info.sidebarLabel ?? info.name,
        shortcut: info.shortcut,
        lifecycle: pluginExport.lifecycle,
        version: info.version,
        author: info.author,
        description: info.description,
        external: true,
        pluginPath: info.path,
      }

      pluginRegistry.register(plugin)
      console.log(`[pluginLoader] Registered external plugin: ${info.id} (nodeType: ${info.nodeType})`)
    } catch (err) {
      console.error(`[pluginLoader] Failed to load renderer for ${info.id}:`, err)
    }
  }
}
