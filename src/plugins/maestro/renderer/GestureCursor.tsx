import React from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import type { GestureStatus } from './useHandGestureNavigation'

export const CURSOR_SIZE        = 44
export const DWELL_RING_RADIUS  = 18
export const DWELL_CIRCUMFERENCE = 2 * Math.PI * DWELL_RING_RADIUS

/** All inner element refs the hook needs to drive the cursor imperatively. */
export interface GestureCursorHandles {
  containerRef: RefObject<HTMLDivElement | null>
  ringRef:      RefObject<HTMLDivElement | null>
  dotRef:       RefObject<HTMLDivElement | null>
  dwellRef:     RefObject<SVGCircleElement | null>
}

interface Props {
  handles: GestureCursorHandles
  status:  GestureStatus
}

/**
 * AR-style cursor for Maestro Hand-gestures.
 *
 * Rendered as a fixed overlay — all position and state updates are done
 * imperatively by the hook (direct DOM writes in the RAF loop) so we don't
 * trigger React re-renders at 60 fps.
 *
 * Visual states (driven by hook via style / attribute writes):
 *   idle     — small ring at index fingertip, purple
 *   panning  — larger ring at palm centroid, blue
 *   zooming  — ring at midpoint between hands, teal + crosshair dot
 *   hovering — ring glows white + dwell progress arc fills
 */
export function GestureCursor({ handles, status }: Props): React.ReactElement | null {
  if (status === 'off') return null

  // Portal to document.body — escapes all app stacking contexts so the cursor
  // is always rendered above every node, modal, and overlay, just like a real cursor.
  return createPortal(
    <div
      ref={handles.containerRef}
      data-no-canvas-gesture
      style={{
        position:      'fixed',
        top:           0,
        left:          0,
        width:         CURSOR_SIZE,
        height:        CURSOR_SIZE,
        pointerEvents: 'none',
        zIndex:        9997,
        opacity:       0,           // hook fades in/out
        willChange:    'transform, opacity',
      }}
    >
      {/* Dwell progress arc — SVG circle with animated stroke-dashoffset */}
      <svg
        width={CURSOR_SIZE}
        height={CURSOR_SIZE}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        <circle
          ref={handles.dwellRef}
          cx={CURSOR_SIZE / 2}
          cy={CURSOR_SIZE / 2}
          r={DWELL_RING_RADIUS}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.5}
          strokeDasharray={String(DWELL_CIRCUMFERENCE)}
          strokeDashoffset={String(DWELL_CIRCUMFERENCE)}
          strokeLinecap="round"
          transform={`rotate(-90 ${CURSOR_SIZE / 2} ${CURSOR_SIZE / 2})`}
          style={{ opacity: 0, transition: 'stroke 0.15s' }}
        />
      </svg>

      {/* Cursor ring — size + color driven by hook */}
      <div
        ref={handles.ringRef}
        style={{
          position:   'absolute',
          top:        '50%',
          left:       '50%',
          transform:  'translate(-50%, -50%)',
          width:      20,
          height:     20,
          borderRadius: '50%',
          border:     '2px solid #a78bfa',
          boxSizing:  'border-box',
          transition: 'width 0.12s ease, height 0.12s ease, border-color 0.12s, box-shadow 0.12s',
        }}
      />

      {/* Center dot */}
      <div
        ref={handles.dotRef}
        style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%) scale(1)',
          width:        5,
          height:       5,
          borderRadius: '50%',
          background:   '#a78bfa',
          transition:   'transform 0.12s ease, background 0.12s',
        }}
      />
    </div>,
    document.body,
  )
}
