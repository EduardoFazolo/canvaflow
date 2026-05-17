import React, { useRef, useMemo, useCallback } from 'react'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'
import { useNodeStore } from '../stores/nodeStore'
import { useCanvasViewportStore } from '../stores/canvasViewportStore'

const MINIMAP_W = 160
const MINIMAP_H = 160
const WORLD_PAD = 60

const NODE_COLORS: Record<string, string> = {
  terminal:     '#6dba9a',
  browser:      '#7aa3d4',
  browserv2:    '#7aa3d4',
  files:        '#c4a24e',
  notion:       '#a0a0a0',
  trello:       '#5b9ec9',
  note:         '#b07ec4',
  monaco:       '#d4a056',
  claude:       '#c47a8a',
  codex:        '#5ec3b3',
  orchestrator: '#d08c5a',
  subagent:     '#8a7ec4',
  kanban:       '#5aafa0',
  windowpicker: '#8a95a3',
}

export function Minimap(): React.ReactElement | null {
  const nodes = useNodeStore((s) => s.nodes)
  const camera = useCameraStore((s) => s.camera)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const bbox = useMemo(() => {
    if (nodes.size === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes.values()) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }
    return {
      minX: minX - WORLD_PAD,
      minY: minY - WORLD_PAD,
      maxX: maxX + WORLD_PAD,
      maxY: maxY + WORLD_PAD,
    }
  }, [nodes])

  if (!bbox) return null

  const worldW = bbox.maxX - bbox.minX
  const worldH = bbox.maxY - bbox.minY
  const scale = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH)

  const offsetX = (MINIMAP_W - worldW * scale) / 2
  const offsetY = (MINIMAP_H - worldH * scale) / 2
  const wx2m = (wx: number) => (wx - bbox.minX) * scale + offsetX
  const wy2m = (wy: number) => (wy - bbox.minY) * scale + offsetY

  // Viewport rect in world space
  const { left, top } = useCanvasViewportStore.getState()
  const vw = Math.max(1, document.documentElement.clientWidth - left)
  const vh = Math.max(1, document.documentElement.clientHeight - top)
  const vpL = -camera.x / camera.zoom
  const vpT = -camera.y / camera.zoom
  const vpW = vw / camera.zoom
  const vpH = vh / camera.zoom

  // Viewport rect in minimap coords
  const vpMx = wx2m(vpL)
  const vpMy = wy2m(vpT)
  const vpMw = vpW * scale
  const vpMh = vpH * scale

  const teleport = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const wx = bbox.minX + (mx - offsetX) / scale
    const wy = bbox.minY + (my - offsetY) / scale
    const { left: cl, top: ct } = useCanvasViewportStore.getState()
    const cvw = Math.max(1, document.documentElement.clientWidth - cl)
    const cvh = Math.max(1, document.documentElement.clientHeight - ct)
    useCameraStore.getState().setCamera({
      ...useCameraStore.getState().camera,
      x: cvw / 2 - wx * useCameraStore.getState().camera.zoom,
      y: cvh / 2 - wy * useCameraStore.getState().camera.zoom,
    })
  }

  return (
    <div
      ref={ref}
      data-no-canvas-gesture
      style={{
        position: 'fixed',
        bottom: 44,
        right: 12,
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: 'rgba(12,12,12,0.88)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'crosshair',
        zIndex: 200,
        backdropFilter: 'blur(6px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        dragging.current = true
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        teleport(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        teleport(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        dragging.current = false
      }}
    >
      {/* Node rects */}
      {Array.from(nodes.values()).map((n) => {
        const color = NODE_COLORS[n.type] ?? 'rgba(255,255,255,0.3)'
        const h = n.minimized ? 32 : n.height
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: wx2m(n.x),
              top: wy2m(n.y),
              width: Math.max(2, n.width * scale),
              height: Math.max(2, h * scale),
              background: color + '33',
              border: `1px solid ${color}66`,
              borderRadius: 1,
              pointerEvents: 'none',
            }}
          />
        )
      })}

      {/* Viewport rect */}
      <div
        style={{
          position: 'absolute',
          left: vpMx,
          top: vpMy,
          width: vpMw,
          height: vpMh,
          background: 'rgba(167,139,250,0.07)',
          border: '1.5px solid rgba(167,139,250,0.55)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Zoom label */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          const cam = useCameraStore.getState().camera
          if (Math.abs(cam.zoom - 1) > 0.01) {
            const cx = document.documentElement.clientWidth / 2
            const cy = document.documentElement.clientHeight / 2
            const ratio = 1 / cam.zoom
            animateCameraTo({ zoom: 1, x: cx - ratio * (cx - cam.x), y: cy - ratio * (cy - cam.y) })
          }
        }}
        style={{
          position: 'absolute',
          bottom: 5,
          right: 6,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          padding: '2px 6px',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 10,
          fontWeight: 500,
          fontFamily: 'inherit',
          letterSpacing: '0.02em',
          cursor: 'pointer',
          lineHeight: 1.4,
          pointerEvents: 'auto',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
      >
        {Math.round(camera.zoom * 100)}%
      </button>
    </div>
  )
}
