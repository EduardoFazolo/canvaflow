import { create } from 'zustand'

export interface Camera {
  x: number
  y: number
  zoom: number
}

interface CameraStore {
  camera: Camera
  setCamera: (camera: Camera) => void
  pan: (dx: number, dy: number) => void
  zoomAt: (screenX: number, screenY: number, delta: number) => void
  zoomByFactor: (factor: number) => void
}

export const MIN_ZOOM = 0.05
const MAX_ZOOM = 2
const ZOOM_SPEED = 0.001

// Last known cursor position in canvas-local coordinates.
// Updated by Canvas.tsx via updateCursorPos() on every mousemove.
export const cursorPos = { x: 0, y: 0 }
export function updateCursorPos(x: number, y: number): void { cursorPos.x = x; cursorPos.y = y }

export const useCameraStore = create<CameraStore>((set, get) => ({
  camera: { x: 0, y: 0, zoom: 1 },

  setCamera: (camera) => set({ camera }),

  pan: (dx, dy) => set((s) => ({
    camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy }
  })),

  zoomAt: (screenX, screenY, delta) => {
    if (!isFinite(screenX) || !isFinite(screenY) || !isFinite(delta)) return
    set((s) => {
      const { camera } = s
      const clampedX = Math.max(0, screenX)
      const clampedY = Math.max(0, screenY)
      const factor = 1 - delta * ZOOM_SPEED
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
      const zoomRatio = newZoom / camera.zoom
      return {
        camera: {
          zoom: newZoom,
          x: clampedX - zoomRatio * (clampedX - camera.x),
          y: clampedY - zoomRatio * (clampedY - camera.y),
        }
      }
    })
  },

  zoomByFactor: (factor) => set((s) => {
    const { camera } = s
    const cx = cursorPos.x > 0 ? cursorPos.x : document.documentElement.clientWidth / 2
    const cy = cursorPos.y > 0 ? cursorPos.y : document.documentElement.clientHeight / 2
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
    const zoomRatio = newZoom / camera.zoom
    return {
      camera: {
        zoom: newZoom,
        x: cx - zoomRatio * (cx - camera.x),
        y: cy - zoomRatio * (cy - camera.y),
      }
    }
  }),
}))

let _animHandle: number | null = null

/** Cancel any in-progress animateCameraTo animation. */
export function cancelCameraAnimation(): void {
  if (_animHandle !== null) {
    cancelAnimationFrame(_animHandle)
    _animHandle = null
  }
}

/** Smoothly animate the camera to a target state over `durationMs` milliseconds. */
export function animateCameraTo(target: Camera, durationMs = 320): void {
  cancelCameraAnimation()
  const start = useCameraStore.getState().camera
  const startTime = performance.now()
  function ease(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t }
  function step(): void {
    const t = Math.min(1, (performance.now() - startTime) / durationMs)
    const e = ease(t)
    useCameraStore.getState().setCamera({
      x: start.x + (target.x - start.x) * e,
      y: start.y + (target.y - start.y) * e,
      zoom: start.zoom + (target.zoom - start.zoom) * e,
    })
    if (t < 1) {
      _animHandle = requestAnimationFrame(step)
    } else {
      _animHandle = null
    }
  }
  _animHandle = requestAnimationFrame(step)
}

export function worldToScreen(wx: number, wy: number, camera: Camera) {
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y,
  }
}

export function screenToWorld(sx: number, sy: number, camera: Camera) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  }
}
