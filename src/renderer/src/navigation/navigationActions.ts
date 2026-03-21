import { useMemo } from 'react'
import { useCameraStore, cancelCameraAnimation } from '../stores/cameraStore'
import { zoomFitNode, zoomExit } from '../utils/zoomFocus'

export interface NavigationActions {
  panBy(dx: number, dy: number): void
  zoomAt(screenX: number, screenY: number, delta: number): void
  zoomByFactor(factor: number): void
  fitNode(nodeId: string): void
  fitAll(): void
}

/**
 * Returns a stable set of canvas action functions.
 * All navigation drivers (mouse, hand gestures, etc.) call these —
 * none of them talk to cameraStore directly.
 */
export function useNavigationActions(): NavigationActions {
  const pan = useCameraStore(s => s.pan)
  const zoomAt = useCameraStore(s => s.zoomAt)
  const zoomByFactor = useCameraStore(s => s.zoomByFactor)

  return useMemo(() => ({
    panBy: pan,
    zoomAt: (x, y, delta) => { cancelCameraAnimation(); zoomAt(x, y, delta) },
    zoomByFactor,
    fitNode: zoomFitNode,
    fitAll: zoomExit,
  }), [pan, zoomAt, zoomByFactor])
}
