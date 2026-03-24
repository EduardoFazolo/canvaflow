import React, { useRef } from 'react'
import { Camera, screenToWorld } from '../stores/cameraStore'
import { useNodeStore, NodeType } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator
} from './ui/context-menu'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'
import { getActiveWorkspace } from '../stores/workspaceStore'
import { zoomFitNode } from '../utils/zoomFocus'
import { pluginRegistry } from '../../../plugins/types'
import { usePluginRegistryVersion } from '../hooks/usePluginRegistry'

/** Built-in node types shown in the hardcoded section of the context menu. */
const BUILTIN_MENU_TYPES = new Set([
  'terminal', 'browser', 'browserv2', 'note', 'files',
  'notion', 'trello', 'claude', 'monaco', 'windowpicker',
  'orchestrator', 'subagent',
])

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasContextMenu({ children }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const clickWorldPos = useRef({ x: 0, y: 0 })
  // Re-render when plugins are registered/unregistered
  usePluginRegistryVersion()

  const addAndFocus = (type: NodeType, ox: number, oy: number, props?: Record<string, unknown>) => {
    const node = add(type, clickWorldPos.current.x - ox, clickWorldPos.current.y - oy, props)
    requestAnimationFrame(() => zoomFitNode(node.id))
  }

  // External plugins that have a sidebar label and aren't built-in
  const externalPlugins = pluginRegistry.getAll().filter(
    (p) => p.sidebarLabel && !BUILTIN_MENU_TYPES.has(p.nodeType)
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger
        onContextMenu={(e: React.MouseEvent) => {
          const camera = useCameraStore.getState().camera
          clickWorldPos.current = screenToWorld(e.clientX, e.clientY, camera)
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => {
          const cwd = getActiveWorkspace()?.path || ''
          addAndFocus('terminal', 300, 200, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Terminal</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘T</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('browser', 400, 300)}>
          <span style={{ flex: 1 }}>New Browser</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘B</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('browserv2', 400, 300)}>
          New Browser V2
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('notion', 450, 350)}>
          New Notion
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('trello', 450, 350)}>
          New Trello
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const cwd = getActiveWorkspace()?.path || ''
          addAndFocus('claude', 350, 240, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Claude</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧C</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const rootPath = getActiveWorkspace()?.path || ''
          addAndFocus('monaco', 500, 320, { rootPath })
        }}>
          <span style={{ flex: 1 }}>New Editor</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧E</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('note', 150, 100)}>
          <span style={{ flex: 1 }}>New Note</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => addAndFocus('windowpicker', 240, 200)}>
          <span style={{ flex: 1 }}>New Window Picker</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧W</span>
        </ContextMenuItem>

        {/* Dynamic entries from external plugins */}
        {externalPlugins.length > 0 && <ContextMenuSeparator />}
        {externalPlugins.map((plugin) => (
          <ContextMenuItem
            key={plugin.id}
            onClick={() => addAndFocus(
              plugin.nodeType as NodeType,
              plugin.defaultSize.width / 2,
              plugin.defaultSize.height / 2,
            )}
          >
            <span style={{ flex: 1 }}>New {plugin.sidebarLabel}</span>
            {plugin.shortcut && (
              <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>
                {formatShortcutHint(plugin.shortcut)}
              </span>
            )}
          </ContextMenuItem>
        ))}

        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => fitAllNodes(useNodeStore.getState().nodes)}>
          <span style={{ flex: 1 }}>Fit All Nodes</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘0</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Convert 'Meta+Shift+M' → '⌘⇧M' for display. */
function formatShortcutHint(shortcut: string): string {
  return shortcut
    .replace(/Meta\+/g, '⌘')
    .replace(/Shift\+/g, '⇧')
    .replace(/Alt\+/g, '⌥')
    .replace(/Ctrl\+/g, '⌃')
}
