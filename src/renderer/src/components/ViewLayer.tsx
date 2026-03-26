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

export function ViewLayer(): React.ReactElement {
  const { instances, activeId } = useViewStore()
  const prevActiveId = useRef(activeId)

  // When switching between canvas tabs, swap the node store's active workspace
  useEffect(() => {
    if (prevActiveId.current === activeId) return
    const prevId = prevActiveId.current
    prevActiveId.current = activeId

    const prevInst = useViewStore.getState().instances.find((i) => i.id === prevId)
    const nextInst = useViewStore.getState().instances.find((i) => i.id === activeId)

    // Save current camera for the view we're leaving
    if (prevInst?.type === 'canvas') {
      _viewCameraCache.set(prevId, { ...useCameraStore.getState().camera })
    }

    // If switching to a worktree canvas view, load its node set
    if (nextInst?.type === 'canvas' && nextInst.worktreePath) {
      const viewKey = nextInst.id
      const existing = useNodeStore.getState().workspaceNodes.get(viewKey)
      useNodeStore.getState().loadWorkspace(viewKey, existing ?? new Map())

      // Restore camera for this view
      const cached = _viewCameraCache.get(viewKey)
      if (cached) {
        useCameraStore.setState({ camera: cached })
      } else {
        useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
      }

      // Tell browser views we're on a canvas
      window.browser.setCanvasActive(true)
    }

    // If switching back to main canvas, restore main workspace
    if (nextInst?.type === 'canvas' && !nextInst.worktreePath) {
      const mainWsId = useWorkspaceStore.getState().activeId
      if (mainWsId) {
        const existing = useNodeStore.getState().workspaceNodes.get(mainWsId)
        useNodeStore.getState().loadWorkspace(mainWsId, existing ?? new Map())

        const cached = _viewCameraCache.get('canvas')
        if (cached) {
          useCameraStore.setState({ camera: cached })
        }
      }
      window.browser.setCanvasActive(true)
    }

    // If switching to settings, hide browser views
    if (nextInst?.type === 'settings') {
      window.browser.setCanvasActive(false)
    }
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
