import { createPortal } from 'react-dom'
import type { DragDropTarget } from '../../types/dragDrop'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface DragGhostTheme {
  background: string
  textColor: string
  borderColor: string
  skeletonColor: string
  footerBorderColor: string
  badgeBackground: string
  badgeTextColor: string
  iconBackground: string
  iconSvg: React.ReactNode
}

// ---------------------------------------------------------------------------
// DragGhost — the floating card that follows the cursor during drag
// ---------------------------------------------------------------------------

interface DragGhostProps {
  ghostX: number
  ghostY: number
  title: string
  theme: DragGhostTheme
}

export function DragGhost({ ghostX, ghostY, title, theme }: DragGhostProps) {
  return createPortal(
    <div style={{
      position: 'fixed',
      left: ghostX - 120,
      top: ghostY - 24,
      zIndex: 999999,
      pointerEvents: 'none',
      width: 240,
      background: theme.background,
      border: `1px solid ${theme.borderColor}`,
      borderRadius: 6,
      boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)',
      transform: 'rotate(1.5deg) scale(1.03)',
      transformOrigin: '50% 20%',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ padding: '10px 12px 8px' }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: theme.textColor,
          lineHeight: 1.4, marginBottom: 8, wordBreak: 'break-word',
        }}>
          {title || 'Untitled'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ height: 7, borderRadius: 3, background: theme.skeletonColor, width: '85%' }} />
          <div style={{ height: 7, borderRadius: 3, background: theme.skeletonColor, width: '65%' }} />
        </div>
      </div>
      <div style={{
        padding: '5px 12px 8px',
        borderTop: `1px solid ${theme.footerBorderColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: theme.badgeBackground, borderRadius: 20,
          padding: '2px 7px', fontSize: 10, fontWeight: 600,
          color: theme.badgeTextColor, letterSpacing: '0.01em',
        }}>
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Drop on canvas
        </div>
        <div style={{
          width: 16, height: 16, borderRadius: 3, background: theme.iconBackground,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {theme.iconSvg}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// DropTargetHighlight — overlay on the hovered drop target
// ---------------------------------------------------------------------------

interface DropTargetHighlightProps {
  target: DragDropTarget
  accentColor: string
}

function dropLabel(nodeType: string): string {
  switch (nodeType) {
    case 'claude': return 'Drop to send to Claude'
    case 'codex': return 'Drop to send to Codex'
    case 'terminal': return 'Drop to copy into terminal'
    case 'kanban': return 'Drop to add to Kanban'
    case 'browser': return 'Drop to copy into browser'
    default: return `Drop onto ${nodeType}`
  }
}

export function DropTargetHighlight({ target, accentColor }: DropTargetHighlightProps) {
  return createPortal(
    <div style={{
      position: 'fixed',
      left: target.left, top: target.top,
      width: target.width, height: target.height,
      zIndex: 999998, pointerEvents: 'none', borderRadius: 8,
      border: `1.5px solid ${accentColor}`,
      background: accentColor.replace(/[\d.]+\)$/, '0.12)'),
      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 1px ${accentColor.replace(/[\d.]+\)$/, '0.2)')}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, boxSizing: 'border-box',
    }}>
      <div style={{
        background: 'rgba(19,16,29,0.92)', color: 'rgba(255,255,255,0.9)',
        borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.01em', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        textAlign: 'center',
      }}>
        {dropLabel(target.nodeType)}
      </div>
    </div>,
    document.body
  )
}
