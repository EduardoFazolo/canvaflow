import React, { useEffect, useRef } from 'react'
import { useViewStore } from '../stores/viewStore'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { CanvasView } from '../views/CanvasView'
import { SettingsView } from '../views/SettingsView'

// Per-view camera cache so each worktree canvas restores its own pan/zoom
const _viewCameraCache = new Map<string, { x: number; y: number; zoom: number }>()

function renderView(type: string): React.ReactElement {
  if (type === 'canvas') return <CanvasView />
  if (type === 'settings') return <SettingsView />
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Unknown view: {type}</div>
}

/** Track which view the nodeStore is currently showing */
let _currentViewId = 'canvas'

/**
 * Get the workspace key used in nodeStore for a given view.
 * Worktree views use their view ID. The main canvas uses the real workspace ID.
 */
function workspaceKeyForView(viewId: string): string {
  const inst = useViewStore.getState().instances.find((i) => i.id === viewId)
  if (inst?.worktreePath) return viewId // worktree views use their ID as workspace key
  return useWorkspaceStore.getState().activeId || '' // main canvas uses real workspace ID
}

/**
 * Save the current view's nodes and camera into their workspace slot,
 * without triggering any DB writes (just in-memory bookkeeping).
 */
function saveCurrentViewState(): void {
  const ns = useNodeStore.getState()
  const wsKey = ns.activeWorkspaceId
  if (!wsKey) return

  // Save nodes back into workspaceNodes under the current key
  const workspaceNodes = new Map(ns.workspaceNodes)
  workspaceNodes.set(wsKey, new Map(ns.nodes))
  useNodeStore.setState({ workspaceNodes })

  // Save camera
  _viewCameraCache.set(_currentViewId, { ...useCameraStore.getState().camera })
}

/**
 * Synchronously switch the node store and camera to a given view.
 * Exported so the kanban flow can call it directly before creating nodes.
 */
export function switchToView(viewId: string): void {
  if (_currentViewId === viewId) return

  const inst = useViewStore.getState().instances.find((i) => i.id === viewId)
  if (!inst) return

  // 1. Save the current view's state first
  saveCurrentViewState()

  // 2. Determine the new workspace key
  const newWsKey = workspaceKeyForView(viewId)

  // 3. Load the target view's nodes
  const existing = useNodeStore.getState().workspaceNodes.get(newWsKey)
  useNodeStore.getState().loadWorkspace(newWsKey, existing ?? new Map())

  // 4. Set/clear worktree cwd
  if (inst.worktreePath) {
    useNodeStore.getState().setWorktreeCwd(inst.worktreePath)
  } else {
    useNodeStore.getState().setWorktreeCwd(null)
  }

  // 5. Restore camera
  const cached = _viewCameraCache.get(viewId)
  useCameraStore.setState({ camera: cached ?? { x: 0, y: 0, zoom: 1 } })

  // 6. Update browser view visibility
  window.browser.setCanvasActive(inst.type === 'canvas')

  _currentViewId = viewId
}

export function ViewLayer(): React.ReactElement {
  const { instances, activeId } = useViewStore()
  const prevActiveId = useRef(activeId)

  useEffect(() => {
    if (prevActiveId.current === activeId) return
    prevActiveId.current = activeId
    switchToView(activeId)
  }, [activeId])

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {instances.map((inst) => (
        <div
          key={inst.id}
          style={{
            position: 'absolute',
            inset: 0,
            display: inst.id === activeId ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          {renderView(inst.type)}
        </div>
      ))}
    </div>
  )
}
