/**
 * CanvaFlow Plugin System
 *
 * A plugin is a self-contained module that adds a new node type to the canvas.
 * It spans both the renderer (React component) and the main process (IPC handlers).
 *
 * Usage:
 *   1. Create your plugin manifest implementing CanvaFlowPlugin.
 *   2. Register it in the renderer entry via pluginRegistry.register(myPlugin).
 *   3. Call myPlugin.registerMainHandlers?.(ipcMain) in the main process entry.
 *
 * The node type string you declare becomes the key used in NodeData.type,
 * the SQLite canvas_nodes.type column, and the NodeLayer dispatch lookup.
 */

import type React from 'react'
import type { NodeData } from '../renderer/src/stores/nodeStore'

// ---------------------------------------------------------------------------
// Node lifecycle
// ---------------------------------------------------------------------------

export type NodeHealthStatus = 'healthy' | 'degraded' | 'dead'

/**
 * Standardized lifecycle controller for any node type (built-in or plugin).
 * Implementations are optional — each node type opts into the hooks it supports.
 */
export interface NodeLifecycleController {
  /** Called when the node enters the viewport or becomes active. */
  resume?(): void
  /** Called when the node leaves the viewport or becomes inactive. */
  suspend?(): void
  /** Attempt crash recovery. Returns true if the node recovered. */
  retry?(): Promise<boolean>
  /** Periodic health probe. */
  healthCheck?(): NodeHealthStatus
}

/**
 * Optional lifecycle hooks a plugin can declare.
 * The canvas layer calls these automatically based on viewport visibility.
 */
export interface PluginLifecycle {
  onResume?(nodeId: string): void
  onSuspend?(nodeId: string): void
  onRetry?(nodeId: string): Promise<boolean>
  onHealthCheck?(nodeId: string): NodeHealthStatus
}

// ---------------------------------------------------------------------------
// IPC interface (avoids importing Electron in renderer bundles)
// ---------------------------------------------------------------------------

/**
 * Subset of Electron's IpcMain used by plugins to register handlers.
 * Typed as an interface so the renderer can reference it without importing electron.
 */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: any[]) => unknown | Promise<unknown>,
  ): void
  on(channel: string, listener: (event: unknown, ...args: any[]) => void): void
  removeHandler(channel: string): void
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

export interface CanvaFlowPlugin {
  /** Unique plugin identifier (e.g. 'notion'). Must be URL-safe, no spaces. */
  readonly id: string

  /**
   * The node type string this plugin handles (e.g. 'notion').
   * Must match the value stored in NodeData.type / the DB.
   */
  readonly nodeType: string

  /** Default width and height when a new node of this type is created. */
  readonly defaultSize: { readonly width: number; readonly height: number }

  /** Default title shown in the node's title bar on creation. */
  readonly defaultTitle: string

  /**
   * React component rendered inside BaseNode for this node type.
   * Receives the full NodeData including live props.
   */
  readonly component: React.ComponentType<{ node: NodeData }>

  /**
   * If true, this node is never culled from the DOM when scrolled off-screen.
   * Use for nodes that own a live background process (terminal, Claude, etc.)
   * that must not be unmounted while the canvas is panned or zoomed.
   */
  readonly keepAlive?: boolean

  /** Label shown in the command palette / sidebar "new node" list. */
  readonly sidebarLabel?: string

  /**
   * Keyboard shortcut string to spawn a new node of this type.
   * Format: modifier(s) + key, e.g. 'Meta+Shift+N'.
   * The canvas handles the actual keydown binding; the plugin just declares intent.
   */
  readonly shortcut?: string

  /**
   * Register IPC handlers in the Electron main process.
   * Called once during app startup, before the window is shown.
   * All ipcMain.handle / ipcMain.on calls for this plugin go here.
   */
  registerMainHandlers?(ipcMain: IpcMainLike): void

  /**
   * Absolute paths to preload scripts required by webviews inside this plugin.
   * The main process passes these to the webview `preload` attribute via IPC.
   * Example: path.join(__dirname, '../preload/notionWebview.js')
   */
  readonly preloadScripts?: readonly string[]

  /**
   * Optional lifecycle hooks for viewport-aware suspend/resume and crash recovery.
   * The canvas layer calls these automatically based on node visibility.
   */
  readonly lifecycle?: PluginLifecycle
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class PluginRegistry {
  private readonly _plugins = new Map<string, CanvaFlowPlugin>()

  /**
   * Register a plugin. Throws if the nodeType is already registered
   * to catch accidental double-registration at startup.
   */
  register(plugin: CanvaFlowPlugin): void {
    if (this._plugins.has(plugin.nodeType)) {
      throw new Error(
        `[PluginRegistry] nodeType "${plugin.nodeType}" is already registered by plugin "${this._plugins.get(plugin.nodeType)!.id}".`,
      )
    }
    this._plugins.set(plugin.nodeType, plugin)
  }

  /** Look up a plugin by its nodeType string. Returns undefined if not found. */
  get(nodeType: string): CanvaFlowPlugin | undefined {
    return this._plugins.get(nodeType)
  }

  /** All registered plugins in insertion order. */
  getAll(): CanvaFlowPlugin[] {
    return Array.from(this._plugins.values())
  }

  /** Check whether a nodeType has been registered. */
  has(nodeType: string): boolean {
    return this._plugins.has(nodeType)
  }

  /**
   * Call registerMainHandlers on every plugin that declares one.
   * Call this once in the Electron main process entry point.
   */
  registerAllMainHandlers(ipcMain: IpcMainLike): void {
    for (const plugin of this._plugins.values()) {
      plugin.registerMainHandlers?.(ipcMain)
    }
  }
}

/**
 * Singleton registry — import this wherever you need to register or look up plugins.
 * Renderer and main process each have their own module instance, which is fine:
 * renderer uses component/sidebarLabel/shortcut; main uses registerMainHandlers.
 */
export const pluginRegistry = new PluginRegistry()
