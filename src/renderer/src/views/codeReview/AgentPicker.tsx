import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeData } from '../../stores/nodeStore'
import { agentLabel } from '../../../../plugins/kanban/renderer/agentShared'

const ROLE_COLOR: Record<string, string> = {
  main: '#22c55e',
  reviewer: '#14b8a6',
}

function dotColor(node: NodeData): string {
  return ROLE_COLOR[node.agentRole ?? ''] ?? 'rgba(255,255,255,0.4)'
}

/**
 * Compact dropdown for picking which agent on the canvas should receive a
 * routed message. Designed for use inside comment cards and review headers.
 */
export function AgentPicker({
  agents,
  selectedNodeId,
  onSelect,
  placement = 'bottom',
  disabled,
}: {
  agents: NodeData[]
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
  placement?: 'top' | 'bottom'
  disabled?: boolean
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const selected = agents.find((a) => a.id === selectedNodeId) ?? null
  const label = selected ? agentLabel(selected) : 'Select agent…'

  // Position the popover relative to the trigger button
  useEffect(() => {
    if (!open) return
    const compute = (): void => {
      const btn = buttonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const POPOVER_W = 220
      const POPOVER_H = Math.min(280, agents.length * 36 + 16)
      let top = placement === 'top' ? r.top - POPOVER_H - 6 : r.bottom + 6
      // Right-align under the button
      let left = r.right - POPOVER_W
      if (left < 12) left = 12
      if (top < 12) top = r.bottom + 6
      setPos({ top, left })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, agents.length, placement])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popRef.current?.contains(target)) return
      setOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || agents.length === 0}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px 4px 10px',
          background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          color: disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.78)',
          fontSize: 11,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          cursor: disabled ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {selected && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor(selected), flexShrink: 0,
          }} />
        )}
        <span>{label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" style={{ opacity: 0.5 }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1000000,
            width: 220,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4)',
            padding: 4,
          }}
        >
          {agents.length === 0 ? (
            <div style={{
              padding: '12px',
              fontSize: 11,
              color: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
            }}>
              No agents on this canvas
            </div>
          ) : (
            agents.map((agent) => {
              const isActive = agent.id === selectedNodeId
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => { onSelect(agent.id); setOpen(false) }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: 5,
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.78)',
                    fontSize: 12,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: dotColor(agent), flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agentLabel(agent)}
                  </span>
                </button>
              )
            })
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
