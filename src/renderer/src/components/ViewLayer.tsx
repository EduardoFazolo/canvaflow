import React, { useEffect, useRef } from 'react'
import { useViewStore } from '../stores/viewStore'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { CanvasView } from '../views/CanvasView'
import { SettingsView } from '../views/SettingsView'

// Per-view camera cache so each worktree canvas restores its own pan/zoom
const _viewCameraCache = new Map<string, { x: number; y: number; zoom: number }>()

/** Track which view the nodeStore is currently showing */
let _currentViewId = 'canvas'

/**
 * Save the current view's nodes and camera into their workspace slot.
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
  let newWsKey: string
  if (inst.worktreePath) {
    newWsKey = viewId
  } else {
    newWsKey = useWorkspaceStore.getState().activeId || ''
  }

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

  // Determine if the active view is a canvas or settings
  const activeInst = instances.find((i) => i.id === activeId)
  const isCanvasActive = activeInst?.type === 'canvas'
  const isSettingsOpen = instances.some((i) => i.type === 'settings')

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {/* ONE shared CanvasView for ALL canvas-type tabs.
          Swapping what it shows is handled by nodeStore.loadWorkspace,
          not by mounting multiple CanvasView instances. */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: isCanvasActive ? 'flex' : 'none',
        flexDirection: 'column',
      }}>
        <CanvasView />
      </div>

      {/* Settings is a separate view */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: activeInst?.type === 'settings' ? 'flex' : 'none',
          flexDirection: 'column',
        }}>
          <SettingsView />
        </div>
      )}
    </div>
  )
}
