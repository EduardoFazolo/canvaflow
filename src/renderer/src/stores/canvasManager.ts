/**
 * Canvas Manager
 *
 * A workspace can have many canvases:
 * - The main canvas (ID = workspace ID, cannot be closed)
 * - Branch canvases (ID = view ID, closeable, tied to a git worktree)
 *
 * Each canvas has its own set of nodes and camera position.
 * This module provides the single source of truth for switching between them.
 */

import { useNodeStore, type NodeData } from './nodeStore'
import { useCameraStore } from './cameraStore'
import { useViewStore } from './viewStore'
import { useWorkspaceStore } from './workspaceStore'
import { rowToNode, activateNodesAfterMount } from '../hooks/useWorkspaceInit'

// Per-canvas camera state (in-memory, also persisted via useAutoSave)
const _cameraCache = new Map<string, { x: number; y: number; zoom: number }>()

/** The currently active canvas ID */
let _activeCanvasId = ''

export function getActiveCanvasId(): string {
  return _activeCanvasId
}

/**
 * Save the current canvas's nodes and camera into their slots.
 */
function saveCurrentCanvas(): void {
  // Only save if a canvas view is actually active — if the user is on a
  // non-canvas view (code-review, settings), ns.nodes may be stale/empty
  // and saving them would wipe the real canvas data.
  const activeView = useViewStore.getState().instances.find(
    (i) => i.id === useViewStore.getState().activeId
  )
  if (activeView && activeView.type !== 'canvas') return

  const ns = useNodeStore.getState()
  const canvasId = ns.activeWorkspaceId
  if (!canvasId) return

  // Snapshot nodes into workspaceNodes
  const workspaceNodes = new Map(ns.workspaceNodes)
  workspaceNodes.set(canvasId, new Map(ns.nodes))
  useNodeStore.setState({ workspaceNodes })

  // Cache camera
  _cameraCache.set(canvasId, { ...useCameraStore.getState().camera })
}

/**
 * Switch to a canvas. This is the ONE function that swaps what the canvas displays
 * AND activates the corresponding tab. These two operations must always be paired —
 * calling one without the other causes the tab and canvas to go out of sync.
 */
export function switchCanvas(canvasId: string): void {
  // The main canvas view always has id 'canvas', worktree views use the canvasId directly
  const view = useViewStore.getState().instances.find((i) => i.id === canvasId)
  const viewId = view ? canvasId : 'canvas'

  if (_activeCanvasId === canvasId) {
    // Even if already on this canvas, ensure the tab is in sync
    useViewStore.getState().activate(viewId)
    return
  }

  // Save current canvas state
  if (_activeCanvasId) saveCurrentCanvas()

  // Load the target canvas's nodes
  const existing = useNodeStore.getState().workspaceNodes.get(canvasId)
  if (existing) {
    useNodeStore.getState().loadWorkspace(canvasId, existing)
  } else {
    // No nodes in memory — start with empty, then try loading from appState
    useNodeStore.getState().loadWorkspace(canvasId, new Map())
    if (view?.worktreePath) {
      loadCanvasNodesFromAppState(canvasId)
    }
  }

  // Set worktree cwd for new node creation
  useNodeStore.getState().setWorktreeCwd(view?.worktreePath ?? null)

  // Restore camera — ALWAYS set default first, then override from cache
  useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
  const cached = _cameraCache.get(canvasId)
  if (cached) {
    useCameraStore.setState({ camera: cached })
  } else if (view?.worktreePath) {
    // Try async restore from appState (for restart). Default (0,0,1) is already set above.
    loadCanvasCameraFromAppState(canvasId)
  }

  _activeCanvasId = canvasId

  // Activate the corresponding tab so the UI stays in sync
  useViewStore.getState().activate(viewId)
}

/**
 * Get the main canvas ID (= the active workspace ID).
 */
export function getMainCanvasId(): string {
  return useWorkspaceStore.getState().activeId || ''
}

/**
 * Called when switching workspaces. Resets canvas to the new workspace's main canvas.
 */
export function onWorkspaceSwitch(newWorkspaceId: string): void {
  // If currently on a worktree canvas, switch to main first
  if (_activeCanvasId) saveCurrentCanvas()

  // The new workspace's main canvas ID is its workspace ID
  _activeCanvasId = newWorkspaceId

  // Ensure any worktree tab from the old workspace is deactivated
  const activeView = useViewStore.getState().instances.find(
    (i) => i.id === useViewStore.getState().activeId
  )
  if (activeView?.parentWorkspaceId && activeView.parentWorkspaceId !== newWorkspaceId) {
    useViewStore.getState().activate('canvas')
  }

  // Clear worktree cwd
  useNodeStore.getState().setWorktreeCwd(null)
}

/**
 * Initialize the canvas manager with the current workspace.
 */
export function initCanvasManager(workspaceId: string): void {
  _activeCanvasId = workspaceId
}

/**
 * Load camera from cache (for restoring after app restart).
 */
export function setCachedCamera(canvasId: string, camera: { x: number; y: number; zoom: number }): void {
  _cameraCache.set(canvasId, camera)
}

// ---------------------------------------------------------------------------
// AppState persistence (for worktree canvases that survive restart)
// ---------------------------------------------------------------------------

async function loadCanvasNodesFromAppState(canvasId: string): Promise<void> {
  try {
    const raw = await window.appState.get(`wt_nodes_${canvasId}`)
    if (!raw) return
    const rows = JSON.parse(raw) as any[]
    const nodes = new Map<string, NodeData>()
    for (const row of rows) nodes.set(row.id, rowToNode(row))

    // Merge metadata
    try {
      const nodeIds = [...nodes.keys()]
      if (nodeIds.length > 0) {
        const metaRows = await window.agent.getMetadata(nodeIds)
        for (const meta of metaRows) {
          const node = nodes.get(meta.nodeId)
          if (node) {
            nodes.set(meta.nodeId, {
              ...node,
              lastFocusedAt: meta.lastFocusedAt,
              focusCount: meta.focusCount,
              totalFocusDuration: (meta as any).totalFocusDuration ?? 0,
              tags: (() => { try { return JSON.parse(meta.tags) } catch { return [] } })(),
              agentRole: meta.agentRole ?? null,
              agentSessionId: meta.agentSessionId ?? null,
            })
          }
        }
      }
    } catch {}

    // Only apply if this canvas is still active
    if (_activeCanvasId === canvasId) {
      useNodeStore.getState().loadWorkspace(canvasId, nodes)
      activateNodesAfterMount([...nodes.keys()], nodes)
    } else {
      const wn = new Map(useNodeStore.getState().workspaceNodes)
      wn.set(canvasId, nodes)
      useNodeStore.setState({ workspaceNodes: wn })
    }
  } catch {}
}

async function loadCanvasCameraFromAppState(canvasId: string): Promise<void> {
  try {
    const raw = await window.appState.get(`wt_camera_${canvasId}`)
    if (!raw) return
    const camera = JSON.parse(raw) as { x: number; y: number; zoom: number }
    _cameraCache.set(canvasId, camera)
    if (_activeCanvasId === canvasId) {
      useCameraStore.setState({ camera })
    }
  } catch {}
}
