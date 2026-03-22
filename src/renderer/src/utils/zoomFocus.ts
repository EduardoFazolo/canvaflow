/**
 * Shared zoom-to-fit state used by both the canvas double-tap listener
 * and the webview IPC handlers (NotionNode, BrowserNode).
 * Singleton so all sources share the same prevCamera.
 */
import type { Camera } from '../stores/cameraStore'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import { computeFitCamera, getCanvasRect } from './canvasUtils'

const state: { nodeId: string | null } = {
  nodeId: null,
}

/** Exit zoom mode unconditionally — fits all nodes in view. */
export function zoomExit(): void {
  const { width: vw, height: vh } = getCanvasRect()
  const allNodes = useNodeStore.getState().nodes
  const target = computeFitCamera(allNodes, vw, vh)
  if (target) animateCameraTo(target)
  state.nodeId = null
}

/** Returns the node currently zoomed into, or null if none. */
export function getFocusedNodeId(): string | null {
  return state.nodeId
}

/**
 * When a node is focused, move to the adjacent node in the given direction,
 * sorted by center X. Wraps around at either end so continuous swiping
 * cycles through all nodes indefinitely.
 */
export function swipeToAdjacentNode(direction: 'left' | 'right'): void {
  if (!state.nodeId) return
  const allNodes = useNodeStore.getState().nodes
  if (allNodes.size < 2) return

  // Sort all nodes by center X (left → right on canvas)
  const sorted = Array.from(allNodes.values()).sort(
    (a, b) => (a.x + a.width / 2) - (b.x + b.width / 2)
  )

  const currentIdx = sorted.findIndex(n => n.id === state.nodeId)
  if (currentIdx === -1) return

  const nextIdx = direction === 'right'
    ? (currentIdx + 1) % sorted.length          // wrap: last → first
    : (currentIdx - 1 + sorted.length) % sorted.length  // wrap: first → last

  // Directly animate to the target without going through zoomFitNode's
  // "second tap = zoom out" logic
  const target = sorted[nextIdx]
  const { width: vw, height: vh } = getCanvasRect()
  const camera = computeFitCamera(new Map([[target.id, target]]), vw, vh)
  if (camera) {
    state.nodeId = target.id
    animateCameraTo(camera)
  }
}

export function zoomFitNode(nodeId: string): void {
  const { width: vw, height: vh } = getCanvasRect()
  const allNodes = useNodeStore.getState().nodes
  const node = allNodes.get(nodeId)
  if (!node) return

  // Second tap on the same node → always zoom out to fit all nodes
  if (state.nodeId === nodeId) {
    const target = computeFitCamera(allNodes, vw, vh)
    if (target) animateCameraTo(target)
    state.nodeId = null
    return
  }

  // First tap → zoom to fit this node
  const target = computeFitCamera(new Map([[nodeId, node]]), vw, vh)
  if (!target) return

  state.nodeId = nodeId
  animateCameraTo(target)
}
