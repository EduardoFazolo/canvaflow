import React, { useCallback, useRef, useState } from 'react'
import { useBranchZoneStore, BranchZone, getBorderColor, getLabelColor } from '../stores/branchZoneStore'
import { getActiveWorkspace } from '../stores/workspaceStore'

function BranchZoneCard({ zone }: { zone: BranchZone }): React.ReactElement {
  const { updateZone, removeZone } = useBranchZoneStore()
  const [hovered, setHovered] = useState(false)
  const resizing = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const borderColor = getBorderColor(zone.color)
  const labelColor = getLabelColor(zone.color)

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    resizing.current = true
    resizeStart.current = { x: e.clientX, y: e.clientY, w: zone.width, h: zone.height }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return
      // We need to account for canvas zoom — but since this is in world space,
      // we get zoom from the transform. Pointer deltas are in screen space.
      const canvas = document.getElementById('canvas-viewport')
      const zoom = canvas ? parseFloat(canvas.querySelector('[style*="scale"]')?.getAttribute('style')?.match(/scale\(([^)]+)\)/)?.[1] || '1') : 1
      const dx = (ev.clientX - resizeStart.current.x) / zoom
      const dy = (ev.clientY - resizeStart.current.y) / zoom
      updateZone(zone.id, {
        width: Math.max(400, resizeStart.current.w + dx),
        height: Math.max(300, resizeStart.current.h + dy),
      })
    }

    const onUp = () => {
      resizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [zone.id, zone.width, zone.height, updateZone])

  const handleClose = useCallback(async () => {
    const ws = getActiveWorkspace()
    if (ws) {
      await window.git.worktreeRemove(ws.path, zone.worktreePath).catch(() => {})
    }
    removeZone(zone.id)
  }, [zone.id, zone.worktreePath, removeZone])

  return (
    <div
      data-branch-zone-id={zone.id}
      style={{
        position: 'absolute',
        left: zone.x,
        top: zone.y,
        width: zone.width,
        height: zone.height,
        background: zone.color,
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 12,
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Branch label */}
      <div style={{
        position: 'absolute',
        top: -14,
        left: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          background: borderColor,
          color: '#fff',
          padding: '3px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>&#xE0A0;</span>
          {zone.branch}
        </div>

        {/* Close button */}
        {hovered && (
          <div
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleClose() }}
            style={{
              background: 'rgba(239, 68, 68, 0.8)',
              color: '#fff',
              width: 20,
              height: 20,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onPointerDown={onResizeDown}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 20,
          height: 20,
          cursor: 'nwse-resize',
          opacity: hovered ? 0.5 : 0,
          transition: 'opacity 0.15s',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: 4, bottom: 4 }}>
          <path d="M11 1v10H1" fill="none" stroke={labelColor} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 5v6H5" fill="none" stroke={labelColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

const MemoBranchZoneCard = React.memo(BranchZoneCard, (prev, next) => prev.zone === next.zone)

export function BranchZoneLayer(): React.ReactElement {
  const zones = useBranchZoneStore((s) => s.zones)

  return (
    <>
      {Array.from(zones.values()).map((zone) => (
        <MemoBranchZoneCard key={zone.id} zone={zone} />
      ))}
    </>
  )
}
