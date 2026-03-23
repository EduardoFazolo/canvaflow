import React, { useRef } from 'react'
import { Camera, screenToWorld } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator
} from './ui/context-menu'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'
import { getActiveWorkspace } from '../stores/workspaceStore'

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasContextMenu({ children }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const clickWorldPos = useRef({ x: 0, y: 0 })

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
          add('terminal', clickWorldPos.current.x - 300, clickWorldPos.current.y - 200, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Terminal</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘T</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('browser', clickWorldPos.current.x - 400, clickWorldPos.current.y - 300)}>
          <span style={{ flex: 1 }}>New Browser</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘B</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('browserv2', clickWorldPos.current.x - 400, clickWorldPos.current.y - 300)}>
          New Browser V2
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('notion', clickWorldPos.current.x - 450, clickWorldPos.current.y - 350)}>
          New Notion
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('trello', clickWorldPos.current.x - 450, clickWorldPos.current.y - 350)}>
          New Trello
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const cwd = getActiveWorkspace()?.path || ''
          add('claude', clickWorldPos.current.x - 350, clickWorldPos.current.y - 240, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Claude</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧C</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const cwd = getActiveWorkspace()?.path || ''
          add('codex', clickWorldPos.current.x - 350, clickWorldPos.current.y - 240, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Codex</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧X</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const rootPath = getActiveWorkspace()?.path || ''
          add('monaco', clickWorldPos.current.x - 500, clickWorldPos.current.y - 320, { rootPath })
        }}>
          <span style={{ flex: 1 }}>New Editor</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧E</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => add('note', clickWorldPos.current.x - 150, clickWorldPos.current.y - 100)}>
          <span style={{ flex: 1 }}>New Note</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => fitAllNodes(useNodeStore.getState().nodes)}>
          <span style={{ flex: 1 }}>Fit All Nodes</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘0</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
