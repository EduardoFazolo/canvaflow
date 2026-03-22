import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { useSettingsStore } from '../../../renderer/src/stores/settingsStore'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import type { Camera } from '../../../renderer/src/stores/cameraStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { zoomFitNode, zoomExit, swipeToAdjacentNode } from '../../../renderer/src/utils/zoomFocus'
import {
  INDEX_TIP,
  palmCentroid,
  isOpenPalm,
  isGunGesture,
  isDomainExpansion,
  isVoidHands,
  isPalmFacing,
  isPointingDown,
  extendedFingerCount,
  PAN_SENSITIVITY,
  PAN_DEADZONE,
} from './gestureDetection'

export type GestureStatus = 'off' | 'loading' | 'ready' | 'error'
export type ActiveGesture = 'idle' | 'panning' | 'zooming' | 'prayer'

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const MIN_ZOOM  = 0.05
const MAX_ZOOM  = 5

// ── Feel constants ───────────────────────────────────────────────────────────
/** ms for gesture effect to ramp from 0 → full strength after mode activates. */
const RAMP_DURATION   = 280
/** ms Domain Expansion gesture must be held to toggle sleep/wake. */
const PRAYER_HOLD_DURATION = 1500
/** ms Void Hands gesture must be held to toggle zoom mode. */
const ZOOM_MODE_HOLD_DURATION = 1500
/** Per-frame zoom multiplier when palm faces camera (zoom in). ~1.43× per second at 60fps. */
const ZOOM_IN_RATE  = 1.012
/** Per-frame zoom multiplier when fingers point down (zoom out). */
const ZOOM_OUT_RATE = 0.988
/** EMA factor for cursor position smoothing (0=frozen, 1=raw). */
const CURSOR_SMOOTH   = 0.38
/** Lerp factor applied to camera per frame — gives smooth follow + coasting. */
const CAMERA_LERP     = 0.16
/** ms hovering over a node before zoom-fit fires. */
const DWELL_DURATION  = 700
const DWELL_COOLDOWN  = 1200
/** Normalized x distance hand must travel to snap to adjacent node in browse mode. */
const BROWSE_SNAP_DIST     = 0.20
/** ms gun gesture must be held to exit browse mode. */
const BROWSE_EXIT_DURATION = 700
/** ms cooldown between node snaps in browse mode. */
const BROWSE_SNAP_COOLDOWN = 500

export function useHandGestureNavigation(): {
  videoRef:           RefObject<HTMLVideoElement | null>
  status:             GestureStatus
  gesture:            ActiveGesture
  isSleeping:         boolean
  prayerProgress:     number
  isBrowsing:         boolean
  browseExitProgress: number
  isZoomMode:         boolean
  zoomToggleProgress: number
} {
  const enabled = useSettingsStore(s => s.settings.maestroEnabled)

  const videoRef      = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number | null>(null)

  const [status,        setStatus]        = useState<GestureStatus>('off')
  const [gesture,       setGesture]       = useState<ActiveGesture>('idle')
  const [isSleeping,    setIsSleeping]    = useState(true)   // starts sleeping; prayer gesture wakes it
  const [prayerProgress, setPrayerProgress] = useState(0)

  // Prayer hands toggle
  const isSleepingRef    = useRef(true)  // mirror of isSleeping for use inside rAF
  const prayerHoldStart  = useRef<number | null>(null)
  const prayerFiredRef   = useRef(false)

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
  const focusCooldown  = useRef(false)  // 1s global cooldown after focus fires

  // Browse mode (node sliding when focused)
  const [isBrowsing,         setIsBrowsing]         = useState(false)
  const [browseExitProgress, setBrowseExitProgress] = useState(0)
  const browseModeRef     = useRef(false)
  const browseLastSnapX   = useRef(0)
  const browseSnapCooldown = useRef(false)
  const browseStillStart  = useRef<number | null>(null)
  const browsePalmHistory = useRef<Array<{ x: number; t: number }>>([])

  // Zoom mode (void hands toggle → one-hand palm/back zoom)
  const [isZoomMode,         setIsZoomMode]         = useState(false)
  const [zoomToggleProgress, setZoomToggleProgress] = useState(0)
  const isZoomModeRef  = useRef(false)
  const voidHoldStart  = useRef<number | null>(null)
  const voidFiredRef   = useRef(false)

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
    browsePalmHistory.current = []
    browseStillStart.current  = null
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

    // ── Domain Expansion → sleep / wake toggle ───────────────────────────
    if (landmarks.length >= 2 && isDomainExpansion(landmarks[0], landmarks[1])) {
      if (prayerHoldStart.current === null) {
        prayerHoldStart.current = now
        prayerFiredRef.current  = false
      }
      const progress = Math.min(1, (now - prayerHoldStart.current) / PRAYER_HOLD_DURATION)
      setPrayerProgress(progress)
      if (progress >= 1 && !prayerFiredRef.current) {
        prayerFiredRef.current  = true
        isSleepingRef.current   = !isSleepingRef.current
        setIsSleeping(isSleepingRef.current)
        resetGestureState()
        hideCursor()
        return
      }
      // Show prayer cursor feedback using dwell ring
      const c1  = palmCentroid(landmarks[0])
      const c2  = palmCentroid(landmarks[1])
      const raw = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      const pos = smoothCursor(raw.x, raw.y)
      updateCursor(pos.x, pos.y, 'prayer', false, progress, 1)
      return
    } else {
      if (prayerHoldStart.current !== null) {
        prayerHoldStart.current = null
        prayerFiredRef.current  = false
        setPrayerProgress(0)
      }
    }

    // ── Sleeping — skip all navigation ───────────────────────────────────
    if (isSleepingRef.current) {
      if (gestureModeRef.current !== 'idle') resetGestureState()
      hideCursor()
      return
    }

    // ── Void Hands → zoom mode toggle ────────────────────────────────────
    if (landmarks.length >= 2 && isVoidHands(landmarks[0], landmarks[1])) {
      if (voidHoldStart.current === null) {
        voidHoldStart.current = now
        voidFiredRef.current  = false
      }
      const progress = Math.min(1, (now - voidHoldStart.current) / ZOOM_MODE_HOLD_DURATION)
      setZoomToggleProgress(progress)
      if (progress >= 1 && !voidFiredRef.current) {
        voidFiredRef.current    = true
        isZoomModeRef.current   = !isZoomModeRef.current
        setIsZoomMode(isZoomModeRef.current)
        resetGestureState()
        hideCursor()
        return
      }
      const c1  = palmCentroid(landmarks[0])
      const c2  = palmCentroid(landmarks[1])
      const raw = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      const pos = smoothCursor(raw.x, raw.y)
      updateCursor(pos.x, pos.y, 'zooming', false, progress, 1)
      return
    } else {
      if (voidHoldStart.current !== null) {
        voidHoldStart.current = null
        voidFiredRef.current  = false
        setZoomToggleProgress(0)
      }
    }

    // ── One hand ─────────────────────────────────────────────────────────
    if (landmarks.length === 1) {
      const lm       = landmarks[0]
      const openPalm = isOpenPalm(lm)
      const gunGesture = isGunGesture(lm)

      // ── Open palm → PAN (no node interaction) ────────────────────────
      if (openPalm) {
        const palm = palmCentroid(lm)
        const rawScreen = toScreen(palm.x, palm.y)
        const cursorPos = smoothCursor(rawScreen.x, rawScreen.y)

        // Reset dwell when switching to pan
        if (gestureModeRef.current !== 'panning') {
          panStartCam.current  = { ...useCameraStore.getState().camera }
          panStartPalm.current = palm
          dwellNodeId.current  = null
          dwellStartTime.current = null
          setGestureMode('panning')
          updateCursor(cursorPos.x, cursorPos.y, 'panning', false, 0, getRamp(now))
          return
        }

        if (panStartCam.current && panStartPalm.current) {
          const rawDx = palm.x - panStartPalm.current.x
          const rawDy = palm.y - panStartPalm.current.y
          const moved = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
          if (moved < PAN_DEADZONE) {
            panStartCam.current  = { ...useCameraStore.getState().camera }
            panStartPalm.current = palm
          } else {
            const ramp    = getRamp(now)
            const targetX = panStartCam.current.x + (-rawDx * w * PAN_SENSITIVITY * ramp)
            const targetY = panStartCam.current.y + ( rawDy * h * PAN_SENSITIVITY * ramp)
            const current = useCameraStore.getState().camera
            setCamera({
              ...current,
              x: current.x + (targetX - current.x) * CAMERA_LERP,
              y: current.y + (targetY - current.y) * CAMERA_LERP,
            })
          }
        }

        updateCursor(cursorPos.x, cursorPos.y, 'panning', false, 0, getRamp(now))

      } else if (gunGesture) {
        // ── Gun gesture → dwell-to-focus ─────────────────────────────────
        if (gestureModeRef.current === 'panning') {
          panStartCam.current  = null
          panStartPalm.current = null
          setGestureMode('idle')
        }

        const rawScreen = toScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y)
        const cursorPos = smoothCursor(rawScreen.x, rawScreen.y)
        const hitNodeId = hitTestScreen(cursorPos.x, cursorPos.y)

        if (hitNodeId !== dwellNodeId.current) {
          dwellNodeId.current    = hitNodeId
          dwellStartTime.current = hitNodeId ? now : null
          dwellCooldown.current  = false
        }

        let dwellProgress = 0
        if (dwellNodeId.current && dwellStartTime.current !== null && !dwellCooldown.current && !focusCooldown.current) {
          dwellProgress = Math.min(1, (now - dwellStartTime.current) / DWELL_DURATION)
          if (dwellProgress >= 1) {
            dwellCooldown.current = true
            focusCooldown.current = true
            setTimeout(() => { focusCooldown.current = false }, 1000)
            zoomFitNode(dwellNodeId.current)
            browseModeRef.current     = true
            browseLastSnapX.current   = palmCentroid(lm).x
            browsePalmHistory.current = []
            browseStillStart.current  = null
            setIsBrowsing(true)
          }
        }

        updateCursor(cursorPos.x, cursorPos.y, 'idle', hitNodeId !== null, dwellProgress, 1)

      } else {
        // ── Neutral → cursor only, no action ─────────────────────────────
        if (gestureModeRef.current === 'panning') {
          panStartCam.current  = null
          panStartPalm.current = null
          setGestureMode('idle')
        }
        // Clear dwell when not in gun pose
        dwellNodeId.current    = null
        dwellStartTime.current = null

        const rawScreen = toScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y)
        const cursorPos = smoothCursor(rawScreen.x, rawScreen.y)
        updateCursor(cursorPos.x, cursorPos.y, 'idle', false, 0, 1)
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

  // ── Zoom mode frame processing ────────────────────────────────────────────

  function processZoomModeFrame(landmarks: NormalizedLandmark[][]): void {
    const now = performance.now()
    const cx  = window.innerWidth / 2
    const cy  = window.innerHeight / 2
    const { setCamera } = useCameraStore.getState()

    // Domain expansion still toggles sleep from zoom mode
    if (landmarks.length >= 2 && isDomainExpansion(landmarks[0], landmarks[1])) {
      if (prayerHoldStart.current === null) { prayerHoldStart.current = now; prayerFiredRef.current = false }
      const progress = Math.min(1, (now - prayerHoldStart.current) / PRAYER_HOLD_DURATION)
      setPrayerProgress(progress)
      if (progress >= 1 && !prayerFiredRef.current) {
        prayerFiredRef.current = true
        isSleepingRef.current  = true
        setIsSleeping(true)
        isZoomModeRef.current  = false
        setIsZoomMode(false)
        resetGestureState(); hideCursor(); return
      }
      const c1 = palmCentroid(landmarks[0]), c2 = palmCentroid(landmarks[1])
      const raw2 = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      const pos  = smoothCursor(raw2.x, raw2.y)
      updateCursor(pos.x, pos.y, 'prayer', false, progress, 1)
      return
    } else {
      if (prayerHoldStart.current !== null) { prayerHoldStart.current = null; prayerFiredRef.current = false; setPrayerProgress(0) }
    }

    // Void hands again → exit zoom mode
    if (landmarks.length >= 2 && isVoidHands(landmarks[0], landmarks[1])) {
      if (voidHoldStart.current === null) { voidHoldStart.current = now; voidFiredRef.current = false }
      const progress = Math.min(1, (now - voidHoldStart.current) / ZOOM_MODE_HOLD_DURATION)
      setZoomToggleProgress(progress)
      if (progress >= 1 && !voidFiredRef.current) {
        voidFiredRef.current  = true
        isZoomModeRef.current = false
        setIsZoomMode(false)
        setZoomToggleProgress(0)
        hideCursor(); return
      }
      const c1 = palmCentroid(landmarks[0]), c2 = palmCentroid(landmarks[1])
      const raw = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      const pos = smoothCursor(raw.x, raw.y)
      updateCursor(pos.x, pos.y, 'zooming', false, progress, 1)
      return
    } else {
      if (voidHoldStart.current !== null) { voidHoldStart.current = null; voidFiredRef.current = false; setZoomToggleProgress(0) }
    }

    if (landmarks.length === 0) { hideCursor(); return }

    const lm = landmarks[0]

    if (isPalmFacing(lm)) {
      // Palm toward camera → zoom in
      const cam    = useCameraStore.getState().camera
      const newZoom = Math.min(MAX_ZOOM, cam.zoom * ZOOM_IN_RATE)
      const ratio   = newZoom / cam.zoom
      setCamera({ zoom: newZoom, x: cx - ratio * (cx - cam.x), y: cy - ratio * (cy - cam.y) })
      const raw = toScreen(palmCentroid(lm).x, palmCentroid(lm).y)
      const pos1 = smoothCursor(raw.x, raw.y)
      updateCursor(pos1.x, pos1.y, 'zooming', false, 0, 1)
    } else if (isPointingDown(lm)) {
      // Fingers pointing down → zoom out
      const cam     = useCameraStore.getState().camera
      const newZoom = Math.max(MIN_ZOOM, cam.zoom * ZOOM_OUT_RATE)
      const ratio   = newZoom / cam.zoom
      setCamera({ zoom: newZoom, x: cx - ratio * (cx - cam.x), y: cy - ratio * (cy - cam.y) })
      const raw = toScreen(palmCentroid(lm).x, palmCentroid(lm).y)
      const pos2 = smoothCursor(raw.x, raw.y)
      updateCursor(pos2.x, pos2.y, 'zooming', false, 0, 1)
    } else {
      // Neutral — cursor only, no zoom
      const raw = toScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y)
      const pos = smoothCursor(raw.x, raw.y)
      updateCursor(pos.x, pos.y, 'idle', false, 0, 1)
    }
  }

  // ── Browse mode frame processing ─────────────────────────────────────────

  function processBrowseFrame(landmarks: NormalizedLandmark[][]): void {
    const now = performance.now()

    // Domain expansion still toggles sleep from browse mode
    if (landmarks.length >= 2 && isDomainExpansion(landmarks[0], landmarks[1])) {
      if (prayerHoldStart.current === null) { prayerHoldStart.current = now; prayerFiredRef.current = false }
      const progress = Math.min(1, (now - prayerHoldStart.current) / PRAYER_HOLD_DURATION)
      setPrayerProgress(progress)
      if (progress >= 1 && !prayerFiredRef.current) {
        prayerFiredRef.current = true
        isSleepingRef.current  = true
        setIsSleeping(true)
        browseModeRef.current  = false
        setIsBrowsing(false)
        resetGestureState(); hideCursor(); return
      }
      const c1 = palmCentroid(landmarks[0]), c2 = palmCentroid(landmarks[1])
      const raw = toScreen((c1.x + c2.x) / 2, (c1.y + c2.y) / 2)
      updateCursor(raw.x, raw.y, 'prayer', false, progress, 1)
      return
    } else {
      if (prayerHoldStart.current !== null) { prayerHoldStart.current = null; prayerFiredRef.current = false; setPrayerProgress(0) }
    }

    if (landmarks.length === 0) {
      setBrowseExitProgress(0)
      browseStillStart.current = null
      hideCursor()
      return
    }

    const lm  = landmarks[0]
    const gun = isGunGesture(lm)

    // ── Gun gesture held → exit browse mode ───────────────────────────
    if (gun) {
      if (browseStillStart.current === null) browseStillStart.current = now
      const exitProgress = Math.min(1, (now - browseStillStart.current) / BROWSE_EXIT_DURATION)
      setBrowseExitProgress(exitProgress)

      // Show gun cursor with exit ring
      const rawScreen = toScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y)
      const cursorPos = smoothCursor(rawScreen.x, rawScreen.y)
      updateCursor(cursorPos.x, cursorPos.y, 'idle', false, exitProgress, 1)

      if (exitProgress >= 1) {
        browseModeRef.current     = false
        browseStillStart.current  = null
        browsePalmHistory.current = []
        setIsBrowsing(false)
        setBrowseExitProgress(0)
        resetSmoothing()
        zoomExit()
      }
      return
    }

    // Reset exit timer when not in gun pose
    if (browseStillStart.current !== null) {
      browseStillStart.current = null
      setBrowseExitProgress(0)
    }
    hideCursor()

    // ── Slide to adjacent node (open hand only, 3+ fingers) ───────────
    const palm      = palmCentroid(lm)
    const handOpen  = extendedFingerCount(lm) >= 3

    if (browseSnapCooldown.current) {
      // Float reference during cooldown — prevents return-swipe triggering opposite direction
      browseLastSnapX.current = palm.x
    } else if (handOpen) {
      const dx = palm.x - browseLastSnapX.current
      if (Math.abs(dx) > BROWSE_SNAP_DIST) {
        browseSnapCooldown.current = true
        browseLastSnapX.current    = palm.x
        swipeToAdjacentNode(dx > 0 ? 'left' : 'right')  // video mirrored
        setTimeout(() => { browseSnapCooldown.current = false }, BROWSE_SNAP_COOLDOWN)
      }
    } else {
      // Hand not open — float the reference so closing/reopening hand
      // doesn't immediately trigger a snap from accumulated drift
      browseLastSnapX.current = palm.x
    }
  }

  // ── Detection loop ───────────────────────────────────────────────────────

  function startDetectionLoop(): void {
    function loop(): void {
      if (!videoRef.current || !landmarkerRef.current) return
      if (videoRef.current.readyState >= 2) {
        try {
          const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now())
          if (browseModeRef.current) {
            processBrowseFrame(results.landmarks)
          } else if (isZoomModeRef.current) {
            processZoomModeFrame(results.landmarks)
          } else {
            processFrame(results.landmarks)
          }
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

  return { videoRef, status, gesture, isSleeping, prayerProgress, isBrowsing, browseExitProgress, isZoomMode, zoomToggleProgress }
}
