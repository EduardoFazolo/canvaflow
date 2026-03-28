import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { titleToBranchName } from '../../../renderer/src/utils/branch'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import type { KanbanCard } from '../store'

export interface WorktreeConfig {
  agentId: 'orchestrate' | 'claude'
  branchName: string
  branchFromMain: boolean
  /** Skip worktree — run agent directly on main/current branch */
  workOnMain?: boolean
}

interface Props {
  card: KanbanCard
  onConfirm: (config: WorktreeConfig) => Promise<void>
  onClose: () => void
}

const AGENTS = [
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

export function WorktreeStartModal({ card, onConfirm, onClose }: Props): React.ReactElement {
  const [branchName, setBranchName] = useState(titleToBranchName(card.title))
  const [branchFromMain, setBranchFromMain] = useState(false)
  const [workOnMain, setWorkOnMain] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRepo, setIsRepo] = useState(true)

  const workspace = getActiveWorkspace()

  useEffect(() => {
    const p = workspace?.path
    if (!p) { setIsRepo(false); return }
    window.git.isRepo(p).then((ok) => {
      if (!ok) setIsRepo(false)
    }).catch(() => setIsRepo(false))
  }, [workspace?.path])

  const handleStart = useCallback(async (agentId: 'orchestrate' | 'claude') => {
    if (!workOnMain && !branchName.trim()) return
    setLoading(true)
    setError('')
    try {
      await onConfirm({ agentId, branchName: branchName.trim(), branchFromMain, workOnMain })
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setLoading(false)
    }
  }, [branchName, branchFromMain, workOnMain, onConfirm])

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
          background: '#161616', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: 20, width: 360,
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
          }}>
            Start Worktree Agent
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {card.title}
          </div>
          {card.description && (
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4, lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {card.description}
            </div>
          )}
        </div>

        {/* Branch name (editable) — hidden when working on main */}
        {!workOnMain && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>
              Branch name
            </div>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'rgba(34,211,238,0.85)',
                fontSize: 12,
                fontFamily: 'monospace',
                padding: '7px 10px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Branch from main toggle — hidden when working on main */}
        {!workOnMain && (
          <div style={{
            marginBottom: 16, padding: '10px 12px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            border: `1px solid ${branchFromMain ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.07)'}`,
            opacity: isRepo ? 1 : 0.4, transition: 'border-color 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                onClick={() => isRepo && setBranchFromMain((v) => !v)}
                style={{
                  width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                  background: branchFromMain ? '#0891b2' : 'rgba(255,255,255,0.12)',
                  position: 'relative', cursor: isRepo ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2,
                  left: branchFromMain ? 15 : 2,
                  width: 13, height: 13, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                  Branch from main
                </div>
                <div style={{
                  fontSize: 11, marginTop: 2,
                  color: branchFromMain ? 'rgba(34,211,238,0.65)' : 'rgba(255,255,255,0.28)',
                  fontFamily: 'monospace',
                }}>
                  {branchFromMain ? 'Will branch from main' : 'Will branch from current HEAD'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Work on main toggle */}
        <div style={{
          marginBottom: 16, padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          border: `1px solid ${workOnMain ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.07)'}`,
          opacity: isRepo ? 1 : 0.4, transition: 'border-color 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => isRepo && setWorkOnMain((v) => !v)}
              style={{
                width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                background: workOnMain ? '#d97706' : 'rgba(255,255,255,0.12)',
                position: 'relative', cursor: isRepo ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: workOnMain ? 15 : 2,
                width: 13, height: 13, borderRadius: '50%',
                background: '#fff', transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                Work on main
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: workOnMain ? 'rgba(251,191,36,0.65)' : 'rgba(255,255,255,0.28)',
                fontFamily: 'monospace',
              }}>
                {workOnMain ? 'No worktree — runs on current branch' : 'Will create a worktree branch'}
              </div>
            </div>
          </div>
        </div>

        {!isRepo && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'rgba(239,68,68,0.8)', fontSize: 11,
          }}>
            Not a git repository — worktree creation unavailable
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'rgba(239,68,68,0.8)', fontSize: 11, wordBreak: 'break-word',
          }}>
            {error}
          </div>
        )}

        {/* Agent picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Start session with
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AGENTS.map((agent) => {
              const isOrchestrate = agent.id === 'orchestrate'
              const borderColor = isOrchestrate ? 'rgba(52,211,153,0.25)' : 'rgba(34,211,238,0.25)'
              const bgColor = isOrchestrate ? 'rgba(52,211,153,0.07)' : 'rgba(34,211,238,0.08)'
              const borderHover = isOrchestrate ? 'rgba(52,211,153,0.45)' : 'rgba(34,211,238,0.45)'
              const bgHover = isOrchestrate ? 'rgba(52,211,153,0.14)' : 'rgba(34,211,238,0.15)'
              const iconColor = isOrchestrate ? 'rgba(52,211,153,0.9)' : 'rgba(34,211,238,0.9)'
              const iconBg = isOrchestrate ? 'rgba(52,211,153,0.15)' : 'rgba(34,211,238,0.15)'
              const disabled = loading || !isRepo

              return (
                <button
                  key={agent.id}
                  onClick={() => handleStart(agent.id)}
                  disabled={disabled}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                    border: `1px solid ${borderColor}`, background: bgColor,
                    color: disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                    fontSize: 13, fontWeight: 500, cursor: disabled ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'inherit',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled) Object.assign((e.currentTarget as HTMLElement).style, { background: bgHover, borderColor: borderHover })
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

        {/* Cancel */}
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
