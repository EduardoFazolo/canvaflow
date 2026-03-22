import React from 'react'
import type { RefObject } from 'react'
import type { GestureStatus, ActiveGesture } from './useHandGestureNavigation'

interface Props {
  videoRef:           RefObject<HTMLVideoElement | null>
  status:             GestureStatus
  gesture:            ActiveGesture
  isSleeping:         boolean
  prayerProgress:     number
  isBrowsing:         boolean
  browseExitProgress: number
  isZoomMode:         boolean
  zoomToggleProgress: number
}

const GESTURE_LABEL: Record<ActiveGesture, string> = {
  idle:    'Hand detected',
  panning: 'Panning',
  zooming: 'Zooming',
  prayer:  'Domain Expansion…',
}

const STATUS_COLOR: Record<GestureStatus, string> = {
  off:     'transparent',
  loading: '#f59e0b',
  ready:   '#4ade80',
  error:   '#f87171',
}

export function GestureOverlay({ videoRef, status, gesture, isSleeping, prayerProgress, isBrowsing, browseExitProgress, isZoomMode, zoomToggleProgress }: Props): React.ReactElement | null {
  if (status === 'off') return null

  const dotColor   = isSleeping              ? '#6b7280'
                   : isBrowsing             ? '#f97316'
                   : isZoomMode             ? '#34d399'
                   : gesture === 'prayer'   ? '#fbbf24'
                   : status === 'ready' && gesture !== 'idle' ? '#a78bfa'
                   : STATUS_COLOR[status]
  const statusText = status === 'loading'  ? 'Loading Maestro…'
                   : status === 'error'    ? 'Camera unavailable'
                   : isSleeping            ? 'Maestro sleeping'
                   : isBrowsing            ? 'Browsing nodes'
                   : isZoomMode            ? 'Zoom mode'
                   : gesture !== 'idle'    ? GESTURE_LABEL[gesture]
                   : 'Maestro ready'

  const RING_R = 54
  const RING_C = (2 * Math.PI * RING_R).toFixed(2)
  const ringOffset = parseFloat(RING_C) * (1 - prayerProgress)

  return (
    <>
      {/* ── Browse mode bar ── */}
      {isBrowsing && (
        <div
          data-no-canvas-gesture
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 18px',
            background: 'rgba(13,13,13,0.88)',
            borderRadius: 24,
            border: '1px solid rgba(249,115,22,0.35)',
            boxShadow: '0 0 20px rgba(249,115,22,0.15)',
            backdropFilter: 'blur(12px)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 16, opacity: 0.5 }}>←</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Slide to browse · 🔫 hold to exit
            </span>
            {browseExitProgress > 0 && (
              <div style={{ width: 80, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{
                  width: `${browseExitProgress * 100}%`,
                  height: '100%',
                  background: '#f97316',
                  borderRadius: 2,
                  transition: 'width 0.05s linear',
                }} />
              </div>
            )}
          </div>
          <span style={{ fontSize: 16, opacity: 0.5 }}>→</span>
        </div>
      )}

      {/* ── Zoom mode status bar ── */}
      {isZoomMode && (
        <div data-no-canvas-gesture style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 18px', background: 'rgba(13,13,13,0.88)', borderRadius: 24,
          border: '1px solid rgba(52,211,153,0.35)', boxShadow: '0 0 20px rgba(52,211,153,0.15)',
          backdropFilter: 'blur(12px)', pointerEvents: 'none', userSelect: 'none',
        }}>
          <span style={{ fontSize: 13 }}>🤚</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Palm in = zoom in · fingers down = zoom out · void to exit
          </span>
          <span style={{ fontSize: 13 }}>🫳</span>
        </div>
      )}

      {/* ── Void hands hold overlay (zoom mode toggle) ── */}
      {zoomToggleProgress > 0 && (
        <div data-no-canvas-gesture style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          pointerEvents: 'none', background: `rgba(0,0,0,${0.18 * zoomToggleProgress})`,
        }}>
          {(() => { const R = 54; const C = (2 * Math.PI * R).toFixed(2); return (
            <svg width={140} height={140}>
              <circle cx={70} cy={70} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
              <circle cx={70} cy={70} r={R} fill="none" stroke="#34d399" strokeWidth={5}
                strokeLinecap="round" strokeDasharray={C}
                strokeDashoffset={String(parseFloat(C) * (1 - zoomToggleProgress))}
                transform="rotate(-90 70 70)" />
              <text x={70} y={70} textAnchor="middle" dominantBaseline="central" fontSize={36}>◇</text>
            </svg>
          )})()}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>
            {isZoomMode ? 'Exit Zoom Mode' : 'Zoom Mode'}
          </div>
        </div>
      )}

      {/* ── Centered prayer activation overlay ── */}
      {prayerProgress > 0 && (
        <div
          data-no-canvas-gesture
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            pointerEvents: 'none',
            background: `rgba(0,0,0,${0.18 * prayerProgress})`,
            transition: 'background 0.1s',
          }}
        >
          <svg width={140} height={140}>
            {/* background ring */}
            <circle cx={70} cy={70} r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
            {/* progress ring */}
            <circle
              cx={70} cy={70} r={RING_R}
              fill="none"
              stroke={isSleeping ? '#fbbf24' : '#a78bfa'}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={String(ringOffset)}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke 0.3s' }}
            />
            <text x={70} y={70} textAnchor="middle" dominantBaseline="central" fontSize={36}>🔺</text>
          </svg>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
          }}>
            {isSleeping ? 'Wake Maestro' : 'Sleep Maestro'}
          </div>
        </div>
      )}

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
        border: `1px solid ${isSleeping ? 'rgba(107,114,128,0.3)' : gesture !== 'idle' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
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
            opacity: status === 'ready' ? (isSleeping ? 0.35 : 1) : 0,
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
            {gesture === 'panning' ? 'PAN' : gesture === 'zooming' ? 'ZOOM' : gesture === 'prayer' ? '🔺' : ''}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
