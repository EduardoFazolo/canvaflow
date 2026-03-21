import React from 'react'
import type { RefObject } from 'react'
import type { GestureStatus, ActiveGesture } from './useHandGestureNavigation'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  status:   GestureStatus
  gesture:  ActiveGesture
}

const GESTURE_LABEL: Record<ActiveGesture, string> = {
  idle:    'Hand detected',
  panning: 'Panning',
  zooming: 'Zooming',
}

const STATUS_COLOR: Record<GestureStatus, string> = {
  off:     'transparent',
  loading: '#f59e0b',
  ready:   '#4ade80',
  error:   '#f87171',
}

export function GestureOverlay({ videoRef, status, gesture }: Props): React.ReactElement | null {
  if (status === 'off') return null

  const dotColor   = status === 'ready' && gesture !== 'idle' ? '#a78bfa' : STATUS_COLOR[status]
  const statusText = status === 'loading' ? 'Loading Maestro…'
                   : status === 'error'   ? 'Camera unavailable'
                   : gesture === 'idle'   ? 'Maestro ready'
                   : GESTURE_LABEL[gesture]

  return (
    <div
      data-no-canvas-gesture
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Status pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px 5px 8px',
        background: 'rgba(13,13,13,0.85)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: status !== 'off' ? `0 0 6px ${dotColor}` : 'none',
          flexShrink: 0,
          transition: 'background 0.2s, box-shadow 0.2s',
        }} />
        <span style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}>
          {statusText}
        </span>
      </div>

      {/* Webcam preview — always in DOM so the hook can access the element */}
      <div style={{
        width: 120,
        height: 90,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${gesture !== 'idle' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
        background: '#111',
        transition: 'border-color 0.2s',
        position: 'relative',
      }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Mirror so it feels like a reflection (natural for hand control)
            transform: 'scaleX(-1)',
            display: 'block',
            opacity: status === 'ready' ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        />
        {status !== 'ready' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'inherit' }}>
              {status === 'loading' ? '…' : '✕'}
            </span>
          </div>
        )}
        {/* Gesture indicator badge */}
        {status === 'ready' && gesture !== 'idle' && (
          <div style={{
            position: 'absolute',
            top: 4,
            left: 4,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(167,139,250,0.85)',
            fontSize: 9,
            color: '#fff',
            fontFamily: 'inherit',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {gesture === 'panning' ? 'PAN' : gesture === 'zooming' ? 'ZOOM' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
