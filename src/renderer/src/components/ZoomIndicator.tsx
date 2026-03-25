import React, { useCallback } from 'react'
import { useCameraStore, animateCameraTo } from '../stores/cameraStore'

export function ZoomIndicator(): React.ReactElement {
  const zoom = useCameraStore((s) => s.camera.zoom)
  const pct = Math.round(zoom * 100)

  const resetZoom = useCallback(() => {
    const cam = useCameraStore.getState().camera
    if (Math.abs(cam.zoom - 1) > 0.01) {
      const cx = document.documentElement.clientWidth / 2
      const cy = document.documentElement.clientHeight / 2
      const ratio = 1 / cam.zoom
      animateCameraTo({
        zoom: 1,
        x: cx - ratio * (cx - cam.x),
        y: cy - ratio * (cy - cam.y),
      })
    }
  }, [])

  return (
    <button
      onClick={resetZoom}
      title="Reset zoom to 100%"
      style={{
        position: 'absolute',
        bottom: 14,
        right: 14,
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '4px 10px',
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        userSelect: 'none',
        lineHeight: 1,
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
      }}
    >
      {pct}%
    </button>
  )
}
