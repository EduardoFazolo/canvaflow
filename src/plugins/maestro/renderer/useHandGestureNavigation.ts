import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useSettingsStore } from '../../../renderer/src/stores/settingsStore'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import type { Camera } from '../../../renderer/src/stores/cameraStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { zoomFitNode } from '../../../renderer/src/utils/zoomFocus'
import {
  INDEX_TIP,
  palmCentroid,
  isOpenPalm,
  twoHandDistance,
  PAN_SENSITIVITY,
  PAN_DEADZONE,
} from './gestureDetection'

export type GestureStatus = 'off' | 'loading' | 'ready' | 'error'
export type ActiveGesture = 'idle' | 'panning' | 'zooming'

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const MIN_ZOOM  = 0.05
const MAX_ZOOM  = 5

// ── Feel constants ───────────────────────────────────────────────────────────
/** ms for gesture effect to ramp from 0 → full strength after mode activates. */
const RAMP_DURATION   = 280
/** EMA factor for cursor position smoothing (0=frozen, 1=raw). */
const CURSOR_SMOOTH   = 0.38
/** Lerp factor applied to camera per frame — gives smooth follow + coasting. */
const CAMERA_LERP     = 0.16
/** ms hovering over a node before zoom-fit fires. */
const DWELL_DURATION  = 700
const DWELL_COOLDOWN  = 1200

export function useHandGestureNavigation(): {
  videoRef: RefObject<HTMLVideoElement | null>
  status:   GestureStatus
  gesture:  ActiveGesture
} {
  const enabled = useSettingsStore(s => s.settings.maestroEnabled)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number | null>(null)

  const [status,  setStatus]  = useState<GestureStatus>('off')
  const [gesture, setGesture] = useState<ActiveGesture>('idle')

  // ── Gesture state ────────────────────────────────────────────────────────
  const gestureModeRef   = useRef<ActiveGesture>('idle')
  const gestureRampStart = useRef<number | null>(null)  // timestamp when current mode began

  // Pan
  const panStartCam  = useRef<Camera | null>(null)
  const panStartPalm = useRef<{ x: number; y: number } | null>(null)

  // Zoom
  const zoomStartCam  = useRef<Camera | null>(null)
  const zoomStartDist = useRef<number | null>(null)

  // Dwell
  const dwellNodeId    = useRef<string | null>(null)
  const dwellStartTime = useRef<number | null>(null)
  const dwellCooldown  = useRef(false)

  // Cursor smoothing (EMA)
  const smoothX = useRef<number | null>(null)
  const smoothY = useRef<number | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function setGestureMode(g: ActiveGesture): void {
    if (gestureModeRef.current === g) return
    gestureModeRef.current = g
    gestureRampStart.current = performance.now()
    setGesture(g)
  }

  /** Ease-out cubic ramp from 0→1 over RAMP_DURATION ms. */
  function getRamp(now: number): number {
    if (gestureRampStart.current === null) return 1
    const t = Math.min(1, (now - gestureRampStart.current) / RAMP_DURATION)
    return 1 - Math.pow(1 - t, 3)
  }

  /** EMA smooth cursor position — reduces per-frame landmark jitter. */
  function smoothCursor(x: number, y: number): { x: number; y: number } {
    if (smoothX.current === null) {
      smoothX.current = x
      smoothY.current = y
    } else {
      smoothX.current += (x - smoothX.current) * CURSOR_SMOOTH
      smoothY.current = (smoothY.current ?? y) + (y - (smoothY.current ?? y)) * CURSOR_SMOOTH
    }
    return { x: smoothX.current, y: smoothY.current! }
  }

  function resetSmoothing(): void {
    smoothX.current = null
    smoothY.current = null
  }

  /** Normalized hand coords → screen pixels (mirrors x to match display). */
  function toScreen(nx: number, ny: number): { x: number; y: number } {
    return { x: (1 - nx) * window.innerWidth, y: ny * window.innerHeight }
  }

  /** Hit-test a screen point against canvas nodes. Returns topmost node id. */
  function hitTestScreen(sx: number, sy: number): string | null {
    const { camera } = useCameraStore.getState()
    const rect = document.getElementById('canvas-viewport')?.getBoundingClientRect()
    const wx = (sx - (rect?.left ?? 0) - camera.x) / camera.zoom
    const wy = (sy - (rect?.top ?? 0) - camera.y) / camera.zoom
    const nodes = useNodeStore.getState().nodes
    let hitId: string | null = null
    let maxZ = -Infinity
    for (const node of nodes.values()) {
      if (wx >= node.x && wx <= node.x + node.width &&
          wy >= node.y && wy <= node.y + node.height) {
        if (node.zIndex > maxZ) { maxZ = node.zIndex; hitId = node.id }
      }
    }
    return hitId
  }

  function resetGestureState(): void {
    panStartCam.current    = null
    panStartPalm.current   = null
    zoomStartCam.current   = null
    zoomStartDist.current  = null
    gestureModeRef.current = 'idle'
    gestureRampStart.current = null
    dwellNodeId.current    = null
    dwellStartTime.current = null
    resetSmoothing()
  }

  // ── Cursor updates via IPC → overlay BrowserWindow ──────────────────────

  function hideCursor(): void {
    window.maestro.updateCursor({ visible: false, x: 0, y: 0, mode: 'idle', hovering: false, dwellProgress: 0, ramp: 0 })
    resetSmoothing()
  }

  function updateCursor(sx: number, sy: number, mode: ActiveGesture, hovering: boolean, dwellProgress: number, ramp: number): void {
    window.maestro.updateCursor({ visible: true, x: sx, y: sy, mode, hovering, dwellProgress, ramp })
  }

  // ── Per-frame processing ─────────────────────────────────────────────────

  function processFrame(landmarks: NormalizedLandmark[][]): void {
    const { setCamera } = useCameraStore.getState()
    const w   = window.innerWidth
    const h   = window.innerHeight
    const now = performance.now()

    // ── Two hands (both open) → zoom ─────────────────────────────────────
    if (landmarks.length >= 2 && isOpenPalm(landmarks[0]) && isOpenPalm(landmarks[1])) {
      const dist = twoHandDistance(landmarks[0], landmarks[1])

      if (gestureModeRef.current !== 'zooming') {
        zoomStartCam.current  = { ...useCameraStore.getState().camera }
        zoomStartDist.current = dist
        panStartCam.current   = null
        panStartPalm.current  = null
        dwellNodeId.current   = null
        setGestureMode('zooming')
      }

      if (zoomStartCam.current && zoomStartDist.current !== null) {
        const spreadRatio = dist / zoomStartDist.current
        const ramp = getRamp(now)

        // Ramp interpolates spreadRatio from neutral (1) toward actual — accidental
        // two-hand frames have near-zero effect during the ramp window.
        const effectiveRatio = 1 + (spreadRatio - 1) * ramp
        const targetZoom     = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
          zoomStartCam.current.zoom * effectiveRatio
        ))

        // Lerp current zoom toward target — prevents snapping, adds coasting
        const currentCam = useCameraStore.getState().camera
        const lerpedZoom = currentCam.zoom + (targetZoom - currentCam.zoom) * CAMERA_LERP
        const zoomRatio  = lerpedZoom / zoomStartCam.current.zoom
        const cx = w / 2, cy = h / 2
        setCamera({
          zoom: lerpedZoom,
          x: cx - zoomRatio * (cx - zoomStartCam.current.x),
          y: cy - zoomRatio * (cy - zoomStartCam.current.y),
        })
      }

      // Cursor at midpoint between palms — smooth it
      const c1  = palmCentroid(landmarks[0])
      const c2  = palmCentroid(landmarks[1])
      const raw = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      const pos = smoothCursor(raw.x, raw.y)
      updateCursor(pos.x, pos.y, 'zooming', false, 0, getRamp(now))
      return
    }

    // ── Dropped from zoom → reset ────────────────────────────────────────
    if (gestureModeRef.current === 'zooming') {
      zoomStartCam.current  = null
      zoomStartDist.current = null
      resetSmoothing()
      setGestureMode('idle')
    }

    // ── One hand ─────────────────────────────────────────────────────────
    if (landmarks.length === 1) {
      const lm       = landmarks[0]
      const openPalm = isOpenPalm(lm)

      // Cursor tracks index tip when pointing, palm centroid when panning
      const cursorLandmark = openPalm ? palmCentroid(lm) : lm[INDEX_TIP]
      const rawScreen      = toScreen(cursorLandmark.x, cursorLandmark.y)
      const cursorPos      = smoothCursor(rawScreen.x, rawScreen.y)

      if (openPalm) {
        // ── Pan ──────────────────────────────────────────────────────────
        const palm = palmCentroid(lm)

        if (gestureModeRef.current !== 'panning') {
          panStartCam.current  = { ...useCameraStore.getState().camera }
          panStartPalm.current = palm
          dwellNodeId.current  = null
          setGestureMode('panning')
          updateCursor(cursorPos.x, cursorPos.y, 'panning', false, 0, getRamp(now))
          return
        }

        if (panStartCam.current && panStartPalm.current) {
          const rawDx = palm.x - panStartPalm.current.x
          const rawDy = palm.y - panStartPalm.current.y
          const moved = Math.sqrt(rawDx * rawDx + rawDy * rawDy)

          if (moved < PAN_DEADZONE) {
            // Float reference with resting hand so movement starts clean
            panStartCam.current  = { ...useCameraStore.getState().camera }
            panStartPalm.current = palm
          } else {
            const ramp    = getRamp(now)
            const targetX = panStartCam.current.x + (-rawDx * w * PAN_SENSITIVITY * ramp)
            const targetY = panStartCam.current.y + ( rawDy * h * PAN_SENSITIVITY * ramp)

            // Lerp camera toward target — smooth follow with natural coasting
            const current = useCameraStore.getState().camera
            setCamera({
              ...current,
              x: current.x + (targetX - current.x) * CAMERA_LERP,
              y: current.y + (targetY - current.y) * CAMERA_LERP,
            })
          }
        }

        updateCursor(cursorPos.x, cursorPos.y, 'panning', false, 0, getRamp(now))

      } else {
        // ── Idle / pointing — cursor + dwell-to-focus ────────────────────
        if (gestureModeRef.current === 'panning') {
          panStartCam.current  = null
          panStartPalm.current = null
          setGestureMode('idle')
        }

        const hitNodeId = hitTestScreen(cursorPos.x, cursorPos.y)

        if (hitNodeId !== dwellNodeId.current) {
          dwellNodeId.current    = hitNodeId
          dwellStartTime.current = hitNodeId ? now : null
          dwellCooldown.current  = false
        }

        let dwellProgress = 0
        if (dwellNodeId.current && dwellStartTime.current !== null && !dwellCooldown.current) {
          dwellProgress = Math.min(1, (now - dwellStartTime.current) / DWELL_DURATION)
          if (dwellProgress >= 1) {
            dwellCooldown.current = true
            zoomFitNode(dwellNodeId.current)
          }
        }

        updateCursor(cursorPos.x, cursorPos.y, 'idle', hitNodeId !== null, dwellProgress, 1)
      }

    } else {
      // No hands
      if (gestureModeRef.current !== 'idle') {
        resetGestureState()
        setGesture('idle')
      }
      hideCursor()
    }
  }

  // ── Detection loop ───────────────────────────────────────────────────────

  function startDetectionLoop(): void {
    function loop(): void {
      if (!videoRef.current || !landmarkerRef.current) return
      if (videoRef.current.readyState >= 2) {
        try {
          const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now())
          processFrame(results.landmarks)
        } catch { /* transient — continue */ }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function cleanup(): void {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (streamRef.current)       { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (landmarkerRef.current)   { landmarkerRef.current.close(); landmarkerRef.current = null }
    resetGestureState()
    hideCursor()
  }

  // ── Setup / teardown ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      cleanup()
      setStatus('off')
      setGesture('idle')
      return
    }

    let cancelled = false
    setStatus('loading')

    async function setup(): Promise<void> {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelled) return

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        if (cancelled) { landmarker.close(); return }
        landmarkerRef.current = landmarker

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) { stream.getTracks().forEach(t => t.stop()); return }

        video.srcObject = stream
        await video.play()
        if (cancelled) return

        setStatus('ready')
        startDetectionLoop()
      } catch (err) {
        if (!cancelled) {
          console.error('[Maestro] Setup failed:', err)
          setStatus('error')
        }
      }
    }

    setup()
    return () => { cancelled = true; cleanup() }
  }, [enabled])

  return { videoRef, status, gesture }
}
