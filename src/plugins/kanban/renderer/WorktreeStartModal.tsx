import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { titleToBranchName } from '../../../renderer/src/utils/branch'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import type { KanbanCard } from '../store'
import { AgentPickerButtons, type AgentId } from './agentShared'

export interface WorktreeConfig {
  agentId: AgentId
  branchName: string
  branchFromMain: boolean
  /** When true, skip worktree creation and run the agent in the current workspace/branch. */
  workInCurrent: boolean
}

interface Props {
  card: KanbanCard
  onConfirm: (config: WorktreeConfig) => Promise<void>
  onClose: () => void
}

export function WorktreeStartModal({ card, onConfirm, onClose }: Props): React.ReactElement {
  const [branchName, setBranchName] = useState(titleToBranchName(card.title))
  const [branchFromMain, setBranchFromMain] = useState(false)
  const [workInCurrent, setWorkInCurrent] = useState(false)
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

  const handleStart = useCallback(async (agentId: AgentId) => {
    if (!workInCurrent && !branchName.trim()) return
    setLoading(true)
    setError('')
    try {
      await onConfirm({
        agentId,
        branchName: branchName.trim(),
        branchFromMain,
        workInCurrent,
      })
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setLoading(false)
    }
  }, [branchName, branchFromMain, workInCurrent, onConfirm])

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

        {/* Work in this branch toggle */}
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          border: `1px solid ${workInCurrent ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.07)'}`,
          opacity: isRepo ? 1 : 0.4, transition: 'border-color 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => isRepo && setWorkInCurrent((v) => !v)}
              style={{
                width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                background: workInCurrent ? '#10b981' : 'rgba(255,255,255,0.12)',
                position: 'relative', cursor: isRepo ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: workInCurrent ? 15 : 2,
                width: 13, height: 13, borderRadius: '50%',
                background: '#fff', transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                Work in this branch
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: workInCurrent ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.28)',
                fontFamily: 'monospace',
              }}>
                {workInCurrent ? 'Run agent in current workspace' : 'Create worktree on a new branch'}
              </div>
            </div>
          </div>
        </div>

        {/* Branch name (editable) */}
        <div style={{ marginBottom: 12, opacity: workInCurrent ? 0.35 : 1, transition: 'opacity 0.15s' }}>
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
            disabled={workInCurrent}
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
              cursor: workInCurrent ? 'not-allowed' : 'text',
            }}
          />
        </div>

        {/* Branch from main toggle */}
        <div style={{
          marginBottom: 16, padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          border: `1px solid ${branchFromMain && !workInCurrent ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.07)'}`,
          opacity: isRepo && !workInCurrent ? 1 : 0.4, transition: 'border-color 0.15s, opacity 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => isRepo && !workInCurrent && setBranchFromMain((v) => !v)}
              style={{
                width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                background: branchFromMain && !workInCurrent ? '#0891b2' : 'rgba(255,255,255,0.12)',
                position: 'relative', cursor: isRepo && !workInCurrent ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: branchFromMain && !workInCurrent ? 15 : 2,
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
                color: branchFromMain && !workInCurrent ? 'rgba(34,211,238,0.65)' : 'rgba(255,255,255,0.28)',
                fontFamily: 'monospace',
              }}>
                {branchFromMain ? 'Will branch from main' : 'Will branch from current HEAD'}
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
        <AgentPickerButtons label="Start session with" loading={loading} disabled={!isRepo} onPick={handleStart} />

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
