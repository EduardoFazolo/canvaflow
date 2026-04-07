import React, { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { useViewStore } from '../../../renderer/src/stores/viewStore'
import { switchCanvas } from '../../../renderer/src/stores/canvasManager'
import type { KanbanCard } from '../store'

// ---------------------------------------------------------------------------
// Shared agent definitions (used by WorktreeStartModal, AgentActionModal, etc.)
// ---------------------------------------------------------------------------

export type AgentId = 'orchestrate' | 'claude'

export const AGENT_OPTIONS: { id: AgentId; label: string; icon: React.ReactElement }[] = [
  {
    id: 'orchestrate',
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
    id: 'claude',
    label: 'Claude',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
      </svg>
    ),
  },
]

// ---------------------------------------------------------------------------
// Agent picker buttons (reusable across modals)
// ---------------------------------------------------------------------------

export function AgentPickerButtons({
  label,
  loading,
  disabled,
  onPick,
}: {
  label: string
  loading: boolean
  disabled?: boolean
  onPick: (agentId: AgentId) => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {AGENT_OPTIONS.map((agent) => {
          const isOrch = agent.id === 'orchestrate'
          const borderColor = isOrch ? 'rgba(52,211,153,0.25)' : 'rgba(34,211,238,0.25)'
          const bgColor = isOrch ? 'rgba(52,211,153,0.07)' : 'rgba(34,211,238,0.08)'
          const borderHover = isOrch ? 'rgba(52,211,153,0.45)' : 'rgba(34,211,238,0.45)'
          const bgHover = isOrch ? 'rgba(52,211,153,0.14)' : 'rgba(34,211,238,0.15)'
          const iconColor = isOrch ? 'rgba(52,211,153,0.9)' : 'rgba(34,211,238,0.9)'
          const iconBg = isOrch ? 'rgba(52,211,153,0.15)' : 'rgba(34,211,238,0.15)'
          const isDisabled = loading || disabled
          return (
            <button
              key={agent.id}
              onClick={() => onPick(agent.id)}
              disabled={isDisabled}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${borderColor}`, background: bgColor,
                color: isDisabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                fontSize: 13, fontWeight: 500, cursor: isDisabled ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit',
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!isDisabled) Object.assign((e.currentTarget as HTMLElement).style, { background: bgHover, borderColor: borderHover })
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
  )
}

// ---------------------------------------------------------------------------
// Generic agent action modal (conflict resolve, code review, etc.)
// ---------------------------------------------------------------------------

export function AgentActionModal({
  accentColor,
  headerIcon,
  headerLabel,
  children,
  pickerLabel,
  onConfirm,
  onClose,
}: {
  accentColor: string
  headerIcon: React.ReactNode
  headerLabel: string
  children: React.ReactNode
  pickerLabel: string
  onConfirm: (agentId: AgentId) => Promise<void>
  onClose: () => void
}): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = useCallback(async (agentId: AgentId) => {
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
          background: '#161616', border: `1px solid ${accentColor}`,
          borderRadius: 12, padding: 20, width: 380,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: accentColor, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {headerIcon}
            {headerLabel}
          </div>
        </div>

        {children}

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'rgba(239,68,68,0.8)', fontSize: 11, wordBreak: 'break-word',
          }}>
            {error}
          </div>
        )}

        <AgentPickerButtons label={pickerLabel} loading={loading} onPick={handleStart} />

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
// Resolve a card's worktree view (find it, reopen if closed, switch canvas)
// ---------------------------------------------------------------------------

export function resolveCardWorktree(cardId: string): { viewKey: string; worktreePath: string } {
  const viewStore = useViewStore.getState()
  let view = viewStore.instances.find((i) => i.sourceCardId === cardId)
  if (!view) {
    const closed = viewStore.closedViews.find((i) => i.sourceCardId === cardId)
    if (closed) {
      viewStore.reopenClosedView(closed.id)
      view = viewStore.instances.find((i) => i.id === closed.id)
    }
  }
  if (!view?.worktreePath) throw new Error('No worktree found for this card')

  switchCanvas(view.id)
  return { viewKey: view.id, worktreePath: view.worktreePath }
}

// ---------------------------------------------------------------------------
// Spawn an agent on a canvas with smart positioning
// ---------------------------------------------------------------------------

/** Find a position that doesn't overlap existing nodes on the target canvas. */
function findFreePosition(canvasId: string, nodeWidth: number, nodeHeight: number, padding = 40): { x: number; y: number } {
  const existing = useNodeStore.getState().workspaceNodes.get(canvasId)
  if (!existing || existing.size === 0) return { x: 100, y: 100 }

  const rects = Array.from(existing.values()).map((n) => ({
    x: n.x, y: n.y, w: n.width, h: n.height,
  }))

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

export function spawnAgent(opts: {
  agentId: AgentId
  viewKey: string
  worktreePath: string
  taskLabel: string
  prompt: string
  /** Skip the auto commit/push phases after the agent finishes (e.g. for review-only agents) */
  skipCommit?: boolean
}): void {
  const { agentId, viewKey, worktreePath, taskLabel, prompt, skipCommit } = opts
  const viewStore = useViewStore.getState()
  const view = viewStore.instances.find((i) => i.id === viewKey)

  if (agentId === 'claude') {
    const pos = findFreePosition(viewKey, 700, 480)
    const newNode = useNodeStore.getState().addToCanvas(viewKey, 'claude', pos.x, pos.y, {
      cwd: worktreePath,
      claudeFlags: '--dangerously-skip-permissions',
    })
    window.coordinator.register(newNode.id, prompt, skipCommit ? { skipCommit: true } : undefined)
    if (view) viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
  } else if (agentId === 'orchestrate') {
    const pos = findFreePosition(viewKey, 520, 500)
    const newNode = useNodeStore.getState().addToCanvas(viewKey, 'orchestrator', pos.x, pos.y, {
      task: taskLabel,
      status: 'idle',
      subagentIds: [],
    })
    if (view) viewStore.updateAgentStatus(view.id, 'idle', newNode.id)
    window.orchestrator.start(newNode.id, {
      task: taskLabel,
      markdown: prompt,
      worldX: pos.x,
      worldY: pos.y,
      workspacePath: worktreePath,
    })
  }
}
