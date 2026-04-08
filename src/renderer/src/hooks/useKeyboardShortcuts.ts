import { useEffect } from 'react'
import { useNodeStore, NodeType } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'
import { notifyCanvasInteractionEnd, notifyCanvasInteractionStart } from '../utils/canvasInteraction'
import { getActiveCwd } from '../stores/viewStore'
import { zoomFitNode } from '../utils/zoomFocus'

interface Options {
  onSearch: () => void
  onSettings: () => void
}

function addAndFocus(
  type: NodeType,
  offsetX: number,
  offsetY: number,
  props?: Record<string, unknown>
): void {
  const camera = useCameraStore.getState().camera
  const vw = document.documentElement.clientWidth / 2
  const vh = document.documentElement.clientHeight / 2
  const wx = (vw - camera.x) / camera.zoom
  const wy = (vh - camera.y) / camera.zoom
  const node = useNodeStore.getState().add(type, wx - offsetX, wy - offsetY, props)
  requestAnimationFrame(() => zoomFitNode(node.id))
}

export function useKeyboardShortcuts({ onSearch, onSettings }: Options): void {
  useEffect(() => {
    const unsub = window.app.onShortcut((name) => {
      switch (name) {
        case 'newTerminal': {
          const cwd = getActiveCwd()
          addAndFocus('terminal', 300, 200, { cwd })
          break
        }
        case 'newBrowser':
          addAndFocus('browser', 400, 300)
          break
        case 'newFiles': {
          const rootPath = getActiveCwd()
          addAndFocus('files', 350, 240, rootPath ? { path: rootPath } : undefined)
          break
        }
        case 'newClaude': {
          const cwd = getActiveCwd()
          addAndFocus('claude', 350, 240, { cwd })
          break
        }
        case 'newEditor': {
          const rootPath = getActiveCwd()
          addAndFocus('monaco', 500, 320, { rootPath })
          break
        }
        case 'newLovable':
          addAndFocus('lovable', 460, 360)
          break
        case 'newWindowPicker':
          addAndFocus('windowpicker', 240, 200)
          break
        case 'fitAll':
          notifyCanvasInteractionStart()
          fitAllNodes(useNodeStore.getState().nodes)
          setTimeout(() => notifyCanvasInteractionEnd(), 180)
          break
        case 'zoomIn':
          notifyCanvasInteractionStart()
          useCameraStore.getState().zoomByFactor(1.25)
          setTimeout(() => notifyCanvasInteractionEnd(), 180)
          break
        case 'zoomOut':
          notifyCanvasInteractionStart()
          useCameraStore.getState().zoomByFactor(1 / 1.25)
          setTimeout(() => notifyCanvasInteractionEnd(), 180)
          break
        case 'search':
          onSearch()
          break
        case 'settings':
          onSettings()
          break
      }
    })
    return unsub
  }, [onSearch, onSettings])
}
