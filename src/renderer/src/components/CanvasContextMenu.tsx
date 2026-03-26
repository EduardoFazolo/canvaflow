import React, { useRef, useState } from 'react'
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
import { useBranchZoneStore } from '../stores/branchZoneStore'
import { NewBranchModal } from './NewBranchModal'

interface Props {
  camera: Camera
  children: React.ReactNode
}

export function CanvasContextMenu({ children }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const clickWorldPos = useRef({ x: 0, y: 0 })
  const [showBranchModal, setShowBranchModal] = useState(false)

  const getZonePath = (): string | null => {
    const zone = useBranchZoneStore.getState().getZoneAtPoint(
      clickWorldPos.current.x,
      clickWorldPos.current.y,
    )
    return zone?.worktreePath ?? null
  }

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
        <ContextMenuItem onClick={() => {
          const cwd = getZonePath() || getActiveWorkspace()?.path || ''
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
          const cwd = getZonePath() || getActiveWorkspace()?.path || ''
          addAndFocus('claude', 350, 240, { cwd })
        }}>
          <span style={{ flex: 1 }}>New Claude</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘⇧C</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const rootPath = getZonePath() || getActiveWorkspace()?.path || ''
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
        <ContextMenuItem onClick={() => addAndFocus('kanban', 490, 280)}>
          New Kanban
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setShowBranchModal(true)}>
          <span style={{ flex: 1 }}>New Branch</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌥B</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => fitAllNodes(useNodeStore.getState().nodes)}>
          <span style={{ flex: 1 }}>Fit All Nodes</span>
          <span style={{ marginLeft: 24, opacity: 0.35, fontSize: 11 }}>⌘0</span>
        </ContextMenuItem>
      </ContextMenuContent>

      {showBranchModal && (
        <NewBranchModal
          onClose={() => setShowBranchModal(false)}
          onConfirm={async (branchName, fromMain) => {
            const ws = getActiveWorkspace()
            if (!ws) { setShowBranchModal(false); return }

            const result = fromMain
              ? await window.git.worktreeAdd(ws.path, branchName, '', 'main')
              : await window.git.worktreeAdd(ws.path, branchName, '')

            if (!result.ok || !result.path) {
              console.error('[branch-zone] worktree creation failed:', result.error)
              setShowBranchModal(false)
              return
            }

            useBranchZoneStore.getState().addZone(
              ws.id,
              branchName,
              result.path,
              clickWorldPos.current.x,
              clickWorldPos.current.y,
            )
            setShowBranchModal(false)
          }}
        />
      )}
    </ContextMenu>
  )
}
