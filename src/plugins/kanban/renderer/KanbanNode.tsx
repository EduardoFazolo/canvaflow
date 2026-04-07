import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { ColorPicker } from '../../../renderer/src/components/ui/color-picker'
import { useNodeStore, type NodeData } from '../../../renderer/src/stores/nodeStore'
import { useViewStore } from '../../../renderer/src/stores/viewStore'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import { useKanbanStore, createDefaultBoard, type KanbanCard, type KanbanColumn, type KanbanBoard, type KanbanState, type ConflictMap } from '../store'
import { KanbanDropModal, type KanbanDropPayload } from './KanbanDropModal'
import { WorktreeStartModal, type WorktreeConfig } from './WorktreeStartModal'
import { CardDetailModal } from './CardDetailModal'
import { switchCanvas } from '../../../renderer/src/stores/canvasManager'
import { buildTaskPrompt } from '../contentExtractor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Find a position that doesn't overlap existing nodes on the target canvas. */
function findFreePosition(canvasId: string, nodeWidth: number, nodeHeight: number, padding = 40): { x: number; y: number } {
  const existing = useNodeStore.getState().workspaceNodes.get(canvasId)
  if (!existing || existing.size === 0) return { x: 100, y: 100 }

  const rects = Array.from(existing.values()).map((n) => ({
    x: n.x, y: n.y, w: n.width, h: n.height,
  }))

  // Place to the right of the rightmost node
  let maxRight = 0
  let bestY = 100
  for (const r of rects) {
    const right = r.x + r.w
    if (right > maxRight) {
      maxRight = right
      bestY = r.y
    }
  }

  return { x: maxRight + padding, y: bestY }
}

// ---------------------------------------------------------------------------
// Drag state (module-level to avoid re-renders during drag)
// ---------------------------------------------------------------------------

let dragCardId: string | null = null
let dragSourceColId: string | null = null
let droppedInternally = false

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const BADGE_COLORS: Record<string, string> = {
  idle: 'rgba(255,255,255,0.2)',
  thinking: '#f59e0b',
  executing: '#3b82f6',
  modifying_files: '#3b82f6',
  done: '#22c55e',
  error: '#ef4444',
  needs_permission: '#f59e0b',
  needs_input: '#f59e0b',
}

function CardItem({
  card,
  columnId,
  columnTitle,
  onDelete,
  onUpdate,
  onExternalDrop,
  onResolveConflicts,
  onRequestReview,
}: {
  card: KanbanCard
  columnId: string
  columnTitle: string
  onDelete: (colId: string, cardId: string) => void
  onUpdate: (colId: string, cardId: string, patch: Partial<KanbanCard>) => void
  onExternalDrop: (card: KanbanCard, clientX: number, clientY: number) => void
  onResolveConflicts: (card: KanbanCard, branchName: string, conflictingFiles: string[]) => void
  onRequestReview: (card: KanbanCard, branchName: string) => void
}): React.ReactElement {
  const [modalOpen, setModalOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Check if this card has an active worktree view
  const worktreeView = useViewStore((s) => s.instances.find((i) => i.sourceCardId === card.id))
  // Check if this card has a closed (past) worktree view
  const closedView = useViewStore((s) => !worktreeView ? s.closedViews.find((i) => i.sourceCardId === card.id) : undefined)

  // Check merge conflicts for this card's branch
  const branchName = worktreeView?.branchName ?? closedView?.branchName
  const conflictingFiles = useKanbanStore((s) => branchName ? s.conflicts[branchName] : undefined)

  const hasContent = !!(card.content || card.description)
  const hasImages = card.content ? JSON.stringify(card.content).includes('"type":"image"') : false

  return (
    <>
      {modalOpen && (
        <CardDetailModal
          card={card}
          onUpdate={(patch) => onUpdate(columnId, card.id, patch)}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div
        draggable={!modalOpen}
        onDragStart={(e) => {
          dragCardId = card.id
          dragSourceColId = columnId
          droppedInternally = false
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('application/canvaflow-kanban-card', '')
          // Create a popped drag image (scaled up with shadow)
          const el = e.currentTarget as HTMLElement
          const clone = el.cloneNode(true) as HTMLElement
          clone.style.transform = 'scale(1.05)'
          clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)'
          clone.style.borderRadius = '6px'
          clone.style.width = `${el.offsetWidth}px`
          clone.style.position = 'fixed'
          clone.style.top = '-9999px'
          clone.style.left = '-9999px'
          clone.style.zIndex = '99999'
          document.body.appendChild(clone)
          e.dataTransfer.setDragImage(clone, e.nativeEvent.offsetX, e.nativeEvent.offsetY)
          requestAnimationFrame(() => document.body.removeChild(clone))
          setHovered(false)
          el.style.opacity = '0.3'
          el.style.transform = 'scale(0.97)'
          el.style.transition = 'opacity 0.15s, transform 0.15s'
        }}
        onDragEnd={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.opacity = '1'
          el.style.transform = 'scale(1)'
          if (!droppedInternally && e.clientX > 0 && e.clientY > 0) {
            onExternalDrop(card, e.clientX, e.clientY)
          }
          dragCardId = null
          dragSourceColId = null
          droppedInternally = false
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (worktreeView) {
            switchCanvas(worktreeView.id)
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setModalOpen(true)
        }}
        style={{
          background: conflictingFiles ? 'rgba(239,68,68,0.04)' : (hovered ? '#1e1e1e' : '#1a1a1a'),
          border: conflictingFiles ? '1px solid rgba(239,68,68,0.3)' : 'none',
          borderRadius: 6,
          padding: conflictingFiles ? '8px 10px' : '9px 11px',
          cursor: (worktreeView || closedView) ? 'pointer' : 'grab',
          transition: 'background 0.12s',
          position: 'relative',
          outline: 'none',
          ...(hovered && conflictingFiles ? {
            borderColor: 'rgba(239,68,68,0.5)',
            background: 'rgba(239,68,68,0.07)',
          } : {}),
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <svg width="6" height="14" viewBox="0 0 6 14" style={{ opacity: hovered ? 0.3 : 0.12, flexShrink: 0, marginTop: 1, transition: 'opacity 0.15s' }}>
            <circle cx="1.5" cy="2" r="1" fill="white" />
            <circle cx="4.5" cy="2" r="1" fill="white" />
            <circle cx="1.5" cy="7" r="1" fill="white" />
            <circle cx="4.5" cy="7" r="1" fill="white" />
            <circle cx="1.5" cy="12" r="1" fill="white" />
            <circle cx="4.5" cy="12" r="1" fill="white" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', lineHeight: 1.3 }}>
              {card.title}
            </div>
            {hasContent && (
              <div style={{ fontSize: 11, color: '#777', marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, wordBreak: 'break-word' }}>
                {hasImages && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 4, color: 'rgba(167,139,250,0.5)' }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/><circle cx="4" cy="5" r="1" fill="currentColor"/><path d="M1 9l3-3 2 2 2-2 3 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
                {card.description}
              </div>
            )}
          </div>
        </div>

        {/* Worktree agent status badge */}
        {worktreeView && worktreeView.agentStatus && (
          <div
            title={`Agent: ${worktreeView.agentStatus}`}
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 8, height: 8, borderRadius: '50%',
              background: BADGE_COLORS[worktreeView.agentStatus] || 'rgba(255,255,255,0.2)',
              animation: (worktreeView.agentStatus === 'thinking' || worktreeView.agentStatus === 'executing' || worktreeView.agentStatus === 'modifying_files')
                ? 'worktree-pulse 1.5s ease-in-out infinite' : undefined,
            }}
          />
        )}

        {/* Reopen past canvas button */}
        {closedView && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              useViewStore.getState().reopenClosedView(closedView.id)
              switchCanvas(closedView.id)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={`View canvas: ${closedView.branchName}`}
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 22, height: 22, borderRadius: 4,
              background: hovered ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.06)',
              border: 'none', color: 'rgba(34,211,238,0.6)',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1,
              transition: 'background 0.12s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="10" rx="1.5" />
              <line x1="2" y1="6" x2="14" y2="6" />
              <line x1="5.5" y1="3" x2="5.5" y2="6" />
            </svg>
          </button>
        )}

        {/* Merge conflict indicator + resolve button */}
        {conflictingFiles && branchName && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 10, color: 'rgba(239,68,68,0.85)', fontWeight: 600,
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1L15 14H1L8 1z" />
                <line x1="8" y1="6" x2="8" y2="9" />
                <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
              </svg>
              {conflictingFiles.length} conflict{conflictingFiles.length !== 1 ? 's' : ''} with main
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onResolveConflicts(card, branchName, conflictingFiles)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '100%', textAlign: 'center', padding: '4px 8px', borderRadius: 4,
                border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)',
                color: 'rgba(239,68,68,0.85)', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => {
                Object.assign((e.currentTarget as HTMLElement).style, {
                  background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)',
                })
              }}
              onMouseLeave={(e) => {
                Object.assign((e.currentTarget as HTMLElement).style, {
                  background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)',
                })
              }}
              title={`Conflicting files:\n${conflictingFiles.join('\n')}`}
            >
              Resolve Conflicts
            </button>
          </div>
        )}

        {/* Code review button — shown for cards in REVIEW column with a branch */}
        {columnTitle.toUpperCase() === 'REVIEW' && branchName && !conflictingFiles && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRequestReview(card, branchName)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '100%', textAlign: 'center', padding: '4px 8px', borderRadius: 4,
                border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.08)',
                color: 'rgba(167,139,250,0.85)', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => {
                Object.assign((e.currentTarget as HTMLElement).style, {
                  background: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.4)',
                })
              }}
              onMouseLeave={(e) => {
                Object.assign((e.currentTarget as HTMLElement).style, {
                  background: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.25)',
                })
              }}
              title="Spawn an agent to review code changes on this branch"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="5" />
                <line x1="10" y1="10" x2="14.5" y2="14.5" />
              </svg>
              Review Code
            </button>
          </div>
        )}

        {hovered && !worktreeView && !closedView && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(columnId, card.id) }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 18, height: 18, borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              border: 'none', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 12, lineHeight: 1,
            }}
            title="Delete card"
          >
            &times;
          </button>
        )}
      </div>
    </>
  )
}

function ColumnHeader({
  column,
  cardCount,
  onRename,
  onColorChange,
  onDelete,
}: {
  column: KanbanColumn
  cardCount: number
  onRename: (id: string, name: string) => void
  onColorChange: (id: string, color: string) => void
  onDelete: (id: string) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.title)
  const [hovered, setHovered] = useState(false)

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) onRename(column.id, trimmed)
    setEditing(false)
  }, [draft, column.id, onRename])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 8px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: column.color, flexShrink: 0 }} />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') commit()
            e.stopPropagation()
          }}
          onBlur={commit}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 3,
            color: '#ccc',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '2px 5px',
            outline: 'none',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
          }}
        />
      ) : (
        <span
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(column.title); setEditing(true) }}
          style={{
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'default',
          }}
        >
          {column.title}
        </span>
      )}

      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, marginLeft: -2 }}>
        {cardCount}
      </span>

      <div style={{ flex: 1 }} />

      {hovered && (
        <ColorPicker
          color={column.color}
          onChange={(c) => onColorChange(column.id, c)}
          swatchSize={14}
        />
      )}

      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(column.id) }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Delete column"
          style={{
            width: 18, height: 18, borderRadius: 4,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, lineHeight: 1,
          }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conflict Resolve Modal
// ---------------------------------------------------------------------------

const CONFLICT_AGENTS = [
  {
    id: 'orchestrate' as const,
    label: 'Orchestrate',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3" fill="currentColor"/>
        <circle cx="3" cy="5" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="17" cy="5" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="3" cy="15" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="17" cy="15" r="2" fill="currentColor" opacity="0.6"/>
        <path d="M5 5.5L8 8.5M15 5.5L12 8.5M5 14.5L8 11.5M15 14.5L12 11.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'claude' as const,
    label: 'Claude',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
      </svg>
    ),
  },
]

function ConflictResolveModal({
  card,
  branchName,
  conflictingFiles,
  onConfirm,
  onClose,
}: {
  card: KanbanCard
  branchName: string
  conflictingFiles: string[]
  onConfirm: (agentId: 'orchestrate' | 'claude') => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = useCallback(async (agentId: 'orchestrate' | 'claude') => {
    setLoading(true)
    setError('')
    try {
      await onConfirm(agentId)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setLoading(false)
    }
  }, [onConfirm])

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}
      onPointerDown={onClose}
    >
      <div
        style={{
          background: '#161616', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: 20, width: 380,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: 'rgba(239,68,68,0.6)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1L15 14H1L8 1z" />
              <line x1="8" y1="6" x2="8" y2="9" />
              <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
            </svg>
            Resolve Merge Conflicts
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
          }}>
            {card.title}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, fontFamily: 'monospace' }}>
            {branchName} → main
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
          }}>
            Conflicting files ({conflictingFiles.length})
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 6, padding: '8px 10px', maxHeight: 120, overflowY: 'auto',
          }}>
            {conflictingFiles.map((file) => (
              <div key={file} style={{
                fontSize: 11, color: 'rgba(239,68,68,0.75)', fontFamily: 'monospace',
                lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {file}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'rgba(239,68,68,0.8)', fontSize: 11, wordBreak: 'break-word',
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Resolve with
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CONFLICT_AGENTS.map((agent) => {
              const isOrch = agent.id === 'orchestrate'
              const borderColor = isOrch ? 'rgba(52,211,153,0.25)' : 'rgba(34,211,238,0.25)'
              const bgColor = isOrch ? 'rgba(52,211,153,0.07)' : 'rgba(34,211,238,0.08)'
              const borderHover = isOrch ? 'rgba(52,211,153,0.45)' : 'rgba(34,211,238,0.45)'
              const bgHover = isOrch ? 'rgba(52,211,153,0.14)' : 'rgba(34,211,238,0.15)'
              const iconColor = isOrch ? 'rgba(52,211,153,0.9)' : 'rgba(34,211,238,0.9)'
              const iconBg = isOrch ? 'rgba(52,211,153,0.15)' : 'rgba(34,211,238,0.15)'
              return (
                <button
                  key={agent.id}
                  onClick={() => handleStart(agent.id)}
                  disabled={loading}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                    border: `1px solid ${borderColor}`, background: bgColor,
                    color: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                    fontSize: 13, fontWeight: 500, cursor: loading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) Object.assign((e.currentTarget as HTMLElement).style, { background: bgHover, borderColor: borderHover })
                  }}
                  onMouseLeave={(e) => {
                    Object.assign((e.currentTarget as HTMLElement).style, { background: bgColor, borderColor })
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, background: iconBg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: iconColor, flexShrink: 0,
                  }}>
                    {agent.icon}
                  </span>
                  {loading ? 'Starting...' : agent.label}
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', textAlign: 'center', padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
            color: 'rgba(255,255,255,0.28)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)' }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Code Review Modal
// ---------------------------------------------------------------------------

const REVIEW_AGENTS = [
  {
    id: 'orchestrate' as const,
    label: 'Orchestrate',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3" fill="currentColor"/>
        <circle cx="3" cy="5" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="17" cy="5" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="3" cy="15" r="2" fill="currentColor" opacity="0.6"/>
        <circle cx="17" cy="15" r="2" fill="currentColor" opacity="0.6"/>
        <path d="M5 5.5L8 8.5M15 5.5L12 8.5M5 14.5L8 11.5M15 14.5L12 11.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'claude' as const,
    label: 'Claude',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
      </svg>
    ),
  },
]

function CodeReviewModal({
  card,
  branchName,
  onConfirm,
  onClose,
}: {
  card: KanbanCard
  branchName: string
  onConfirm: (agentId: 'orchestrate' | 'claude') => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = useCallback(async (agentId: 'orchestrate' | 'claude') => {
    setLoading(true)
    setError('')
    try {
      await onConfirm(agentId)
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setLoading(false)
    }
  }, [onConfirm])

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}
      onPointerDown={onClose}
    >
      <div
        style={{
          background: '#161616', border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: 12, padding: 20, width: 380,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: 'rgba(167,139,250,0.6)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="5" />
              <line x1="10" y1="10" x2="14.5" y2="14.5" />
            </svg>
            Code Review
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
          }}>
            {card.title}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, fontFamily: 'monospace' }}>
            {branchName}
          </div>
        </div>

        <div style={{
          marginBottom: 16, padding: '10px 12px',
          background: 'rgba(167,139,250,0.04)', borderRadius: 8,
          border: '1px solid rgba(167,139,250,0.1)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            The reviewer will analyze <strong style={{ color: 'rgba(167,139,250,0.8)' }}>only the diff</strong> between
            this branch and main, looking for bugs, code smells, sloppiness, and general code quality issues.
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'rgba(239,68,68,0.8)', fontSize: 11, wordBreak: 'break-word',
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Review with
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REVIEW_AGENTS.map((agent) => {
              const isOrch = agent.id === 'orchestrate'
              const borderColor = isOrch ? 'rgba(52,211,153,0.25)' : 'rgba(34,211,238,0.25)'
              const bgColor = isOrch ? 'rgba(52,211,153,0.07)' : 'rgba(34,211,238,0.08)'
              const borderHover = isOrch ? 'rgba(52,211,153,0.45)' : 'rgba(34,211,238,0.45)'
              const bgHover = isOrch ? 'rgba(52,211,153,0.14)' : 'rgba(34,211,238,0.15)'
              const iconColor = isOrch ? 'rgba(52,211,153,0.9)' : 'rgba(34,211,238,0.9)'
              const iconBg = isOrch ? 'rgba(52,211,153,0.15)' : 'rgba(34,211,238,0.15)'
              return (
                <button
                  key={agent.id}
                  onClick={() => handleStart(agent.id)}
                  disabled={loading}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                    border: `1px solid ${borderColor}`, background: bgColor,
                    color: loading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                    fontSize: 13, fontWeight: 500, cursor: loading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) Object.assign((e.currentTarget as HTMLElement).style, { background: bgHover, borderColor: borderHover })
                  }}
                  onMouseLeave={(e) => {
                    Object.assign((e.currentTarget as HTMLElement).style, { background: bgColor, borderColor })
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, background: iconBg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: iconColor, flexShrink: 0,
                  }}>
                    {agent.icon}
                  </span>
                  {loading ? 'Starting...' : agent.label}
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', textAlign: 'center', padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
            color: 'rgba(255,255,255,0.28)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)' }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Main KanbanNode
// ---------------------------------------------------------------------------

export function KanbanNode({ node }: { node: NodeData }): React.ReactElement {
  const workspaceId = useNodeStore((s) => s.activeWorkspaceId)
  const { state, setState: setKanbanState, load, loaded } = useKanbanStore()
  const [pendingDrop, setPendingDrop] = useState<KanbanDropPayload | null>(null)
  const [worktreeDrop, setWorktreeDrop] = useState<{
    card: KanbanCard
    sourceColId: string
    targetColId: string
  } | null>(null)
  const [conflictResolve, setConflictResolve] = useState<{
    card: KanbanCard
    branchName: string
    conflictingFiles: string[]
  } | null>(null)
  const [codeReview, setCodeReview] = useState<{
    card: KanbanCard
    branchName: string
  } | null>(null)

  // Load kanban data for this workspace on mount
  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId, load])

  // Periodically check merge conflicts for all worktree branches
  useEffect(() => {
    const workspace = getActiveWorkspace()
    const rootPath = workspace?.path
    if (!rootPath) return

    const checkConflicts = async () => {
      try {
        const conflicts = await window.git.checkAllWorktreeConflicts(rootPath)
        useKanbanStore.getState().setConflicts(conflicts)
      } catch { /* ignore */ }
    }

    checkConflicts()
    const interval = setInterval(checkConflicts, 120_000)
    return () => clearInterval(interval)
  }, [workspaceId])

  const persist = useCallback(
    (next: KanbanState) => {
      setKanbanState(next)
    },
    [setKanbanState],
  )

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  // ----- Board operations -----

  const addBoard = useCallback(() => {
    const board = createDefaultBoard()
    board.name = `Board ${state.boards.length + 1}`
    persist({ boards: [...state.boards, board], activeBoardId: board.id })
  }, [state, persist])

  const removeBoard = useCallback((boardId: string) => {
    if (state.boards.length <= 1) return
    const remaining = state.boards.filter((b) => b.id !== boardId)
    persist({
      boards: remaining,
      activeBoardId: state.activeBoardId === boardId ? remaining[0].id : state.activeBoardId,
    })
  }, [state, persist])

  const renameBoard = useCallback((boardId: string, name: string) => {
    persist({
      ...state,
      boards: state.boards.map((b) => (b.id === boardId ? { ...b, name } : b)),
    })
  }, [state, persist])

  // ----- Column operations -----

  const updateBoard = useCallback(
    (columns: KanbanColumn[]) => {
      persist({
        ...state,
        boards: state.boards.map((b) => (b.id === activeBoard.id ? { ...b, columns } : b)),
      })
    },
    [state, activeBoard, persist],
  )

  const addColumn = useCallback(() => {
    const colors = ['#868e96', '#1c7ed6', '#f08c00', '#2f9e44', '#7048e8', '#e03131', '#1098ad']
    updateBoard([
      ...activeBoard.columns,
      {
        id: nanoid(8),
        title: 'NEW COLUMN',
        color: colors[activeBoard.columns.length % colors.length],
        cards: [],
      },
    ])
  }, [activeBoard, updateBoard])

  const removeColumn = useCallback((colId: string) => {
    updateBoard(activeBoard.columns.filter((c) => c.id !== colId))
  }, [activeBoard, updateBoard])

  const renameColumn = useCallback((colId: string, title: string) => {
    updateBoard(activeBoard.columns.map((c) => (c.id === colId ? { ...c, title } : c)))
  }, [activeBoard, updateBoard])

  const changeColumnColor = useCallback((colId: string, color: string) => {
    updateBoard(activeBoard.columns.map((c) => (c.id === colId ? { ...c, color } : c)))
  }, [activeBoard, updateBoard])

  // ----- Card operations -----

  const addCard = useCallback((colId: string, title: string) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId
          ? { ...c, cards: [...c.cards, { id: nanoid(8), title }] }
          : c,
      ),
    )
  }, [activeBoard, updateBoard])

  const deleteCard = useCallback((colId: string, cardId: string) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) } : c,
      ),
    )
  }, [activeBoard, updateBoard])

  const updateCard = useCallback((colId: string, cardId: string, patch: Partial<KanbanCard>) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId
          ? { ...c, cards: c.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)) }
          : c,
      ),
    )
  }, [activeBoard, updateBoard])

  // ----- Resolve merge conflicts -----

  const onResolveConflicts = useCallback((card: KanbanCard, branchName: string, conflictingFiles: string[]) => {
    setConflictResolve({ card, branchName, conflictingFiles })
  }, [])

  const onRequestReview = useCallback((card: KanbanCard, branchName: string) => {
    setCodeReview({ card, branchName })
  }, [])

  // ----- External drop (card dragged onto canvas) -----

  const onExternalDrop = useCallback((card: KanbanCard, clientX: number, clientY: number) => {
    setPendingDrop({ title: card.title, subtitle: card.description, clientX, clientY })
  }, [])

  // ----- Drag & drop between columns -----

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const moveCard = useCallback(
    (srcColId: string, targetColId: string, cardId: string, insertIndex?: number) => {
      const srcCol = activeBoard.columns.find((c) => c.id === srcColId)
      if (!srcCol) return
      const card = srcCol.cards.find((c) => c.id === cardId)
      if (!card) return

      const newColumns = activeBoard.columns.map((col) => {
        if (col.id === srcColId && col.id === targetColId) {
          const without = col.cards.filter((c) => c.id !== cardId)
          const idx = insertIndex ?? without.length
          without.splice(idx, 0, card)
          return { ...col, cards: without }
        }
        if (col.id === srcColId) {
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
        }
        if (col.id === targetColId) {
          const idx = insertIndex ?? col.cards.length
          const newCards = [...col.cards]
          newCards.splice(idx, 0, card)
          return { ...col, cards: newCards }
        }
        return col
      })

      updateBoard(newColumns)
    },
    [activeBoard, updateBoard],
  )

  const onDropOnColumn = useCallback(
    (targetColId: string, insertIndex?: number) => {
      if (!dragCardId || !dragSourceColId) return
      if (dragSourceColId === targetColId && insertIndex === undefined) return

      const cardId = dragCardId
      const srcColId = dragSourceColId

      // Intercept drops to "IN PROGRESS" — show worktree modal instead
      const targetCol = activeBoard.columns.find((c) => c.id === targetColId)
      if (targetCol && targetCol.title.toUpperCase() === 'IN PROGRESS' && srcColId !== targetColId) {
        const srcCol = activeBoard.columns.find((c) => c.id === srcColId)
        const card = srcCol?.cards.find((c) => c.id === cardId)
        if (card) {
          // Check if there's already a worktree view for this card
          const existingView = useViewStore.getState().getViewByCardId(card.id)
          if (existingView) {
            // Just switch to it and move the card normally
            switchCanvas(existingView.id)
            moveCard(srcColId, targetColId, cardId, insertIndex)
          } else {
            setWorktreeDrop({ card, sourceColId: srcColId, targetColId })
          }
          dragCardId = null
          dragSourceColId = null
          return
        }
      }

      moveCard(srcColId, targetColId, cardId, insertIndex)
      dragCardId = null
      dragSourceColId = null
    },
    [activeBoard, updateBoard, moveCard],
  )

  if (!loaded) {
    return (
      <BaseNode node={node}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          Loading...
        </div>
      </BaseNode>
    )
  }

  return (
    <BaseNode node={node}>
      {pendingDrop && (
        <KanbanDropModal payload={pendingDrop} onClose={() => setPendingDrop(null)} />
      )}
      {conflictResolve && (
        <ConflictResolveModal
          card={conflictResolve.card}
          branchName={conflictResolve.branchName}
          conflictingFiles={conflictResolve.conflictingFiles}
          onConfirm={async (agentId: 'orchestrate' | 'claude') => {
            const workspace = getActiveWorkspace()
            const cwd = workspace?.path
            if (!cwd) throw new Error('No active workspace')

            const viewStore = useViewStore.getState()
            let view = viewStore.instances.find((i) => i.sourceCardId === conflictResolve.card.id)
            if (!view) {
              const closed = viewStore.closedViews.find((i) => i.sourceCardId === conflictResolve.card.id)
              if (closed) {
                viewStore.reopenClosedView(closed.id)
                view = viewStore.instances.find((i) => i.id === closed.id)
              }
            }
            if (!view?.worktreePath) throw new Error('No worktree found for this card')

            const viewKey = view.id
            const worktreePath = view.worktreePath
            switchCanvas(viewKey)
            setConflictResolve(null)

            const fileList = conflictResolve.conflictingFiles.map(f => `  - ${f}`).join('\n')
            const prompt = [
              `Investigate and resolve merge conflicts between this branch (${conflictResolve.branchName}) and main.`,
              '',
              'The following files have conflicts:',
              fileList,
              '',
              'Steps:',
              '1. First, fetch the latest changes: git fetch origin main',
              '2. Merge main into this branch: git merge origin/main',
              '3. For each conflicting file, carefully examine both sides of the conflict',
              '4. Resolve each conflict by keeping the correct combination of changes from both branches so that both features work correctly',
              '5. Stage the resolved files and complete the merge commit',
              '6. Push to the remote',
              '',
              'Important: Make sure both this branch\'s changes AND main\'s changes are properly preserved and work together.',
            ].join('\n')

            if (agentId === 'claude') {
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'claude', 100, 100, {
                cwd: worktreePath,
                claudeFlags: '--dangerously-skip-permissions',
              })
              window.coordinator.register(newNode.id, prompt)
              viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
            } else if (agentId === 'orchestrate') {
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'orchestrator', 100, 100, {
                task: `Resolve merge conflicts: ${conflictResolve.card.title}`,
                status: 'idle',
                subagentIds: [],
              })
              viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
              window.orchestrator.start(newNode.id, {
                task: `Resolve merge conflicts: ${conflictResolve.card.title}`,
                markdown: prompt,
                worldX: 100,
                worldY: 100,
                workspacePath: worktreePath,
              })
            }
          }}
          onClose={() => setConflictResolve(null)}
        />
      )}
      {worktreeDrop && (
        <WorktreeStartModal
          card={worktreeDrop.card}
          onConfirm={async (config: WorktreeConfig) => {
            const workspace = getActiveWorkspace()
            const cwd = workspace?.path
            if (!cwd) throw new Error('No active workspace')

            // 1. Create the worktree (auto-retry with suffix if branch name is taken)
            const baseBranch = config.branchFromMain ? 'main' : undefined
            let branchName = config.branchName
            let worktreePath: string
            try {
              worktreePath = await window.git.worktreeAdd(cwd, branchName, baseBranch)
            } catch {
              // Branch name taken — append incrementing number
              for (let i = 1; i <= 99; i++) {
                branchName = `${config.branchName}-${i}`
                try {
                  worktreePath = await window.git.worktreeAdd(cwd, branchName, baseBranch)
                  break
                } catch {
                  if (i === 99) throw new Error(`Could not create branch: ${config.branchName}`)
                }
              }
              worktreePath = worktreePath!
            }

            // 2. Create the canvas view tab (but DON'T let it auto-activate yet)
            const viewId = useViewStore.getState().createWorktreeView({
              worktreePath,
              branchName,
              sourceCardId: worktreeDrop.card.id,
              parentWorkspaceId: workspaceId,
            })
            const viewKey = viewId

            // 3. Switch to the worktree canvas (also activates the tab)
            switchCanvas(viewKey)

            // 4. Move card to "In Progress" (operates on kanban store, unaffected by node store)
            moveCard(worktreeDrop.sourceColId, worktreeDrop.targetColId, worktreeDrop.card.id)

            // 5. Close modal
            setWorktreeDrop(null)

            // 6. Build the task prompt (full content, not truncated description)
            const extracted = buildTaskPrompt(worktreeDrop.card)
            const prompt = extracted.text + '\n\nWhen you are done, commit all changes with a descriptive message and push to the remote.'

            // 7. Create the agent node EXPLICITLY in the worktree canvas
            if (config.agentId === 'claude') {
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'claude', 100, 100, {
                cwd: worktreePath,
                claudeFlags: '--dangerously-skip-permissions',
              })

              window.coordinator.register(newNode.id, prompt)
              useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)
            } else if (config.agentId === 'orchestrate') {
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'orchestrator', 100, 100, {
                task: worktreeDrop.card.title,
                status: 'idle',
                subagentIds: [],
              })
              useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)
              window.orchestrator.start(newNode.id, {
                task: worktreeDrop.card.title,
                markdown: prompt,
                worldX: 100,
                worldY: 100,
                workspacePath: worktreePath,
              })
            }
          }}
          onClose={() => setWorktreeDrop(null)}
        />
      )}
      {codeReview && (
        <CodeReviewModal
          card={codeReview.card}
          branchName={codeReview.branchName}
          onConfirm={async (agentId: 'orchestrate' | 'claude') => {
            const workspace = getActiveWorkspace()
            const cwd = workspace?.path
            if (!cwd) throw new Error('No active workspace')

            const viewStore = useViewStore.getState()
            let view = viewStore.instances.find((i) => i.sourceCardId === codeReview.card.id)
            if (!view) {
              const closed = viewStore.closedViews.find((i) => i.sourceCardId === codeReview.card.id)
              if (closed) {
                viewStore.reopenClosedView(closed.id)
                view = viewStore.instances.find((i) => i.id === closed.id)
              }
            }
            if (!view?.worktreePath) throw new Error('No worktree found for this card')

            const viewKey = view.id
            const worktreePath = view.worktreePath
            switchCanvas(viewKey)
            setCodeReview(null)

            const prompt = [
              `You are a code reviewer. Your ONLY job is to review the code changes on this branch (${codeReview.branchName}).`,
              '',
              'IMPORTANT CONSTRAINTS:',
              '- You must ONLY review code — do NOT modify, fix, or change any files.',
              '- Focus EXCLUSIVELY on the diff between this branch and main.',
              '- Do NOT look at or comment on code that was not changed in this branch.',
              '',
              'Steps:',
              '1. Run: git diff main...HEAD',
              '   This shows you ONLY the changes introduced by this branch.',
              '2. If the diff is large, also run: git diff main...HEAD --stat',
              '   to get an overview of which files were changed.',
              '3. Carefully analyze every change in the diff.',
              '',
              'Review the changes for:',
              '- **Bugs**: Logic errors, off-by-one errors, null/undefined issues, race conditions, missing error handling',
              '- **Code smells**: Overly complex functions, deep nesting, magic numbers, duplicated logic, god objects',
              '- **Sloppiness**: Unused imports/variables, leftover debug code (console.log, TODO hacks), inconsistent naming',
              '- **Security**: Injection vulnerabilities, exposed secrets, unsafe deserialization, missing input validation',
              '- **Performance**: Unnecessary re-renders, N+1 queries, missing memoization where it matters, unbounded loops',
              '- **Readability**: Unclear variable/function names, missing context for non-obvious logic, overly clever code',
              '',
              'For each issue found, report:',
              '- The file and approximate location',
              '- What the problem is',
              '- Severity (critical / warning / nit)',
              '- A brief suggestion for how to fix it',
              '',
              'If the code looks clean, say so — do not invent issues.',
              'End with a short summary: how many issues by severity, and an overall assessment.',
            ].join('\n')

            if (agentId === 'claude') {
              const pos = findFreePosition(viewKey, 700, 480)
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'claude', pos.x, pos.y, {
                cwd: worktreePath,
                claudeFlags: '--dangerously-skip-permissions',
              })
              window.coordinator.register(newNode.id, prompt)
              viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
            } else if (agentId === 'orchestrate') {
              const pos = findFreePosition(viewKey, 520, 500)
              const newNode = useNodeStore.getState().addToCanvas(viewKey, 'orchestrator', pos.x, pos.y, {
                task: `Code review: ${codeReview.card.title}`,
                status: 'idle',
                subagentIds: [],
              })
              viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
              window.orchestrator.start(newNode.id, {
                task: `Code review: ${codeReview.card.title}`,
                markdown: prompt,
                worldX: pos.x,
                worldY: pos.y,
                workspacePath: worktreePath,
              })
            }
          }}
          onClose={() => setCodeReview(null)}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#0d0d0d',
        }}
      >
        {/* Board tabs bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}
        >
          {state.boards.map((board) => (
            <BoardTab
              key={board.id}
              board={board}
              active={board.id === state.activeBoardId}
              onSelect={() => persist({ ...state, activeBoardId: board.id })}
              onRename={(name) => renameBoard(board.id, name)}
              onDelete={state.boards.length > 1 ? () => removeBoard(board.id) : undefined}
            />
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); addBoard() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 4,
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, lineHeight: 1, marginLeft: 4,
            }}
            title="Add board"
          >
            +
          </button>
        </div>

        {/* Columns container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 8,
            padding: '8px 10px',
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {activeBoard.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              onDragOver={onDragOver}
              onDrop={onDropOnColumn}
              onAddCard={addCard}
              onDeleteCard={deleteCard}
              onUpdateCard={updateCard}
              onExternalDrop={onExternalDrop}
              onResolveConflicts={onResolveConflicts}
              onRequestReview={onRequestReview}
              onRename={renameColumn}
              onColorChange={changeColumnColor}
              onDelete={removeColumn}
            />
          ))}

          <button
            onClick={(e) => { e.stopPropagation(); addColumn() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              minWidth: 180,
              height: 40,
              borderRadius: 8,
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'
            }}
            title="Add column"
          >
            + Add column
          </button>
        </div>
      </div>
    </BaseNode>
  )
}

// ---------------------------------------------------------------------------
// Board tab
// ---------------------------------------------------------------------------

function BoardTab({
  board,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  board: KanbanBoard
  active: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete?: () => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(board.name)

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) onRename(trimmed)
    setEditing(false)
  }, [draft, onRename])

  return (
    <div
      onClick={() => !editing && onSelect()}
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(board.name); setEditing(true) }}
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'background 0.12s, color 0.12s',
        position: 'relative',
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') commit()
            e.stopPropagation()
          }}
          onBlur={commit}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600,
            fontFamily: 'inherit', width: 70, padding: 0,
          }}
        />
      ) : (
        <span>{board.name}</span>
      )}
      {onDelete && active && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: 14, height: 14, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, lineHeight: 1,
          }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function Column({
  column,
  onDragOver,
  onDrop,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  onExternalDrop,
  onResolveConflicts,
  onRequestReview,
  onRename,
  onColorChange,
  onDelete,
}: {
  column: KanbanColumn
  onDragOver: (e: React.DragEvent) => void
  onDrop: (targetColId: string, insertIndex?: number) => void
  onAddCard: (colId: string, title: string) => void
  onDeleteCard: (colId: string, cardId: string) => void
  onUpdateCard: (colId: string, cardId: string, patch: Partial<KanbanCard>) => void
  onExternalDrop: (card: KanbanCard, clientX: number, clientY: number) => void
  onResolveConflicts: (card: KanbanCard, branchName: string, conflictingFiles: string[]) => void
  onRequestReview: (card: KanbanCard, branchName: string) => void
  onRename: (colId: string, title: string) => void
  onColorChange: (colId: string, color: string) => void
  onDelete: (colId: string) => void
}): React.ReactElement {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [dropHighlight, setDropHighlight] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submitCard = useCallback(() => {
    const trimmed = newTitle.trim()
    if (trimmed) {
      onAddCard(column.id, trimmed)
      setNewTitle('')
    }
    setAdding(false)
  }, [newTitle, column.id, onAddCard])

  return (
    <div
      onDragOver={(e) => { onDragOver(e); setDropHighlight(true) }}
      onDragLeave={() => setDropHighlight(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropHighlight(false)
        droppedInternally = true
        onDrop(column.id)
      }}
      style={{
        minWidth: 240,
        maxWidth: 300,
        flex: '1 0 240px',
        display: 'flex',
        flexDirection: 'column',
        background: dropHighlight ? hexToRgba(column.color, 0.08) : '#141414',
        borderRadius: 8,
        border: dropHighlight
          ? `1px solid ${hexToRgba(column.color, 0.35)}`
          : '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        transform: dropHighlight ? 'scale(1.015)' : 'scale(1)',
        transition: 'background 0.2s ease-out, border-color 0.2s ease-out, transform 0.2s ease-out',
      }}
    >
      <div style={{
        height: dropHighlight ? 4 : 3,
        background: column.color,
        borderRadius: '8px 8px 0 0',
        flexShrink: 0,
        transition: 'height 0.2s ease-out',
      }} />

      <ColumnHeader
        column={column}
        cardCount={column.cards.length}
        onRename={onRename}
        onColorChange={onColorChange}
        onDelete={onDelete}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '0 10px 10px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {column.cards.map((card, idx) => (
          <div
            key={card.id}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDropHighlight(false)
              droppedInternally = true
              onDrop(column.id, idx)
            }}
          >
            <CardItem
              card={card}
              columnId={column.id}
              columnTitle={column.title}
              onDelete={onDeleteCard}
              onUpdate={onUpdateCard}
              onExternalDrop={onExternalDrop}
              onResolveConflicts={onResolveConflicts}
              onRequestReview={onRequestReview}
            />
          </div>
        ))}

        {adding ? (
          <div style={{ padding: 2 }}>
            <input
              ref={inputRef}
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCard()
                if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
                e.stopPropagation()
              }}
              onBlur={submitCard}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Card title..."
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                color: '#ccc',
                fontSize: 12,
                padding: '6px 8px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setAdding(true) }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '6px 4px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderRadius: 4,
              transition: 'color 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)' }}
          >
            + Add card
          </button>
        )}
      </div>
    </div>
  )
}
