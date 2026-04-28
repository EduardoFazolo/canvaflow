import React, { useRef } from 'react'
import { Camera, screenToWorld } from '../stores/cameraStore'
import { useNodeStore, NodeType } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub
} from './ui/context-menu'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'
import { getActiveCwd } from '../stores/viewStore'
import { zoomFitNode } from '../utils/zoomFocus'

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasContextMenu({ children }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const clickWorldPos = useRef({ x: 0, y: 0 })

  const addAndFocus = (type: NodeType, ox: number, oy: number, props?: Record<string, unknown>) => {
    const node = add(type, clickWorldPos.current.x - ox, clickWorldPos.current.y - oy, props)
    requestAnimationFrame(() => zoomFitNode(node.id))
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        shouldOpen={(e: React.MouseEvent) => {
          // Don't open canvas menu when right-clicking inside a node — let native context menu through
          return !(e.target as HTMLElement).closest?.('[data-node-id]')
        }}
        onContextMenu={(e: React.MouseEvent) => {
          const camera = useCameraStore.getState().camera
          clickWorldPos.current = screenToWorld(e.clientX, e.clientY, camera)
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSub trigger="Agents">
          <ContextMenuItem onClick={() => {
            const cwd = getActiveCwd()
            addAndFocus('claude', 350, 240, { cwd })
          }}>
            <span style={{ flex: 1 }}>Claude</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧C</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            const cwd = getActiveCwd()
            addAndFocus('codex', 350, 240, { cwd })
          }}>
            <span style={{ flex: 1 }}>Codex</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧X</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            const cwd = getActiveCwd()
            addAndFocus('claude', 350, 240, { cwd, claudeFlags: '--dangerously-skip-permissions' })
          }}>
            <span style={{ flex: 1 }}>Claude --Dangerous</span>
          </ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSub trigger="Board">
          <ContextMenuItem onClick={() => addAndFocus('kanban', 490, 280)}>
            Kanban
          </ContextMenuItem>
          <ContextMenuItem onClick={() => addAndFocus('notion', 450, 350)}>
            Notion
          </ContextMenuItem>
          <ContextMenuItem onClick={() => addAndFocus('trello', 450, 350)}>
            Trello
          </ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSub trigger="Browse">
          <ContextMenuItem onClick={() => addAndFocus('browser', 400, 300)}>
            <span style={{ flex: 1 }}>Browser</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘B</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => addAndFocus('browserv2', 400, 300)}>
            Browser V2
          </ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSub trigger="Tools">
          <ContextMenuItem onClick={() => {
            const cwd = getActiveCwd()
            addAndFocus('terminal', 300, 200, { cwd })
          }}>
            <span style={{ flex: 1 }}>Terminal</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘T</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            const rootPath = getActiveCwd()
            addAndFocus('monaco', 500, 320, { rootPath })
          }}>
            <span style={{ flex: 1 }}>Editor</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧E</span>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => addAndFocus('note', 150, 100)}>
            Note
          </ContextMenuItem>
          <ContextMenuItem onClick={() => addAndFocus('windowpicker', 240, 200)}>
            <span style={{ flex: 1 }}>Window Picker</span>
            <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧W</span>
          </ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => fitAllNodes(useNodeStore.getState().nodes)}>
          <span style={{ flex: 1 }}>Fit All Nodes</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘0</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
