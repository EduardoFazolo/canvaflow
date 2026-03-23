import { useEffect } from 'react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { fitAllNodes } from '../utils/canvasUtils'
import { notifyCanvasInteractionEnd, notifyCanvasInteractionStart } from '../utils/canvasInteraction'
import { getActiveWorkspace } from '../stores/workspaceStore'

interface Options {
  onSearch: () => void
  onSettings: () => void
}

export function useKeyboardShortcuts({ onSearch, onSettings }: Options): void {
  useEffect(() => {
    const unsub = window.app.onShortcut((name) => {
      switch (name) {
        case 'newTerminal': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          const cwd = getActiveWorkspace()?.path || ''
          useNodeStore.getState().add('terminal', wx - 300, wy - 200, { cwd })
          break
        }
        case 'newBrowser': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          useNodeStore.getState().add('browser', wx - 400, wy - 300)
          break
        }
        case 'newFiles': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          useNodeStore.getState().add('files', wx - 350, wy - 240)
          break
        }
        case 'newClaude': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          const cwd = getActiveWorkspace()?.path || ''
          useNodeStore.getState().add('claude', wx - 350, wy - 240, { cwd })
          break
        }
        case 'newCodex': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          const cwd = getActiveWorkspace()?.path || ''
          useNodeStore.getState().add('codex', wx - 350, wy - 240, { cwd })
          break
        }
        case 'newEditor': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          const rootPath = getActiveWorkspace()?.path || ''
          useNodeStore.getState().add('monaco', wx - 500, wy - 320, { rootPath })
          break
        }
        case 'newLovable': {
          const camera = useCameraStore.getState().camera
          const vw = document.documentElement.clientWidth / 2
          const vh = document.documentElement.clientHeight / 2
          const wx = (vw - camera.x) / camera.zoom
          const wy = (vh - camera.y) / camera.zoom
          useNodeStore.getState().add('lovable', wx - 460, wy - 360)
          break
        }
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
