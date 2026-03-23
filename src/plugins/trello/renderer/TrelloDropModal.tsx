import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import { getPreparedTrelloExport, primeTrelloExport, createTrelloNoteFromDrop } from '../utils/trelloDrag'
import type { TrelloCard } from '../main/handlers'

export interface TrelloDropPayload {
  cardId: string
  title: string
  clientX: number
  clientY: number
  prefetchedCard: TrelloCard | null
  apiKey: string
  token: string
  partition: string
}

function titleToBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

interface Agent {
  id: string
  label: string
  icon: React.ReactNode
}

const AGENTS: Agent[] = [
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
  {
    id: 'codex',
    label: 'Codex',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M5 5h4v4H5zM11 5h4v4h-4zM5 11h4v4H5zM11 11h4v4h-4z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'note',
    label: 'Note',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6.5 7h7M6.5 10h7M6.5 13h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
]

interface Props {
  payload: TrelloDropPayload
  onClose: () => void
}

export function TrelloDropModal({ payload, onClose }: Props): React.ReactElement {
  const { cardId, title, clientX, clientY, prefetchedCard, apiKey, token, partition } = payload

  const [autoBranch, setAutoBranch] = useState(false)
  const branchName = titleToBranchName(title)
  const [branchBlocked, setBranchBlocked] = useState(false)
  const [branchBlockReason, setBranchBlockReason] = useState('')
  const [loading, setLoading] = useState(false)

  const workspace = getActiveWorkspace()

  useEffect(() => {
    const p = workspace?.path
    if (!p) { setBranchBlocked(true); setBranchBlockReason('No active workspace'); return }
    window.git.isRepo(p).then((isRepo) => {
      if (!isRepo) { setBranchBlocked(true); setBranchBlockReason('Not a git repo'); return }
      window.git.status(p).then((s) => {
        if (s.files.length > 0) { setBranchBlocked(true); setBranchBlockReason('Uncommitted changes') }
      }).catch(() => { setBranchBlocked(true); setBranchBlockReason('Git error') })
    }).catch(() => { setBranchBlocked(true); setBranchBlockReason('Git error') })
  }, [workspace?.path])

  const handleStart = useCallback(async (agentId: string) => {
    if (agentId === 'orchestrate') {
      setLoading(true)
      try {
        const canvasEl = document.querySelector('[data-canvas-root]')
        const canvasRect = canvasEl?.getBoundingClientRect()
        if (!canvasRect) return

        const camera = useCameraStore.getState().camera
        const wx = (clientX - canvasRect.left - camera.x) / camera.zoom
        const wy = (clientY - canvasRect.top - camera.y) / camera.zoom

        let markdown = title
        const prepared = getPreparedTrelloExport(cardId)
        if (prepared) {
          markdown = prepared.markdown
        } else if (apiKey && token) {
          try {
            const result = await primeTrelloExport(apiKey, token, cardId)
            markdown = result.markdown
          } catch {}
        } else {
          try {
            const card = await window.trello.fetchCardWithSession(partition, cardId)
            if (card.desc) markdown = `${card.name}\n\n${card.desc}`
          } catch {}
        }

        const node = useNodeStore.getState().add('orchestrator', wx, wy, {
          task: title,
          status: 'idle',
          subagentIds: [],
        })

        await window.orchestrator.start(node.id, {
          task: title,
          markdown,
          worldX: wx,
          worldY: wy,
          workspacePath: workspace?.path,
        })

        onClose()
      } catch (e) {
        console.error('[TrelloDropModal] orchestrate error:', e)
      } finally {
        setLoading(false)
      }
      return
    }
    if (agentId === 'note') {
      setLoading(true)
      try {
        await createTrelloNoteFromDrop({ cardId, title }, clientX, clientY, prefetchedCard, apiKey, token, partition)
        onClose()
      } catch (e) {
        console.error('[TrelloDropModal] note error:', e)
      } finally {
        setLoading(false)
      }
      return
    }

    if (agentId !== 'claude' && agentId !== 'codex') return
    setLoading(true)
    try {
      const cwd = workspace?.path || ''

      if (autoBranch && !branchBlocked && cwd) {
        await window.git.checkoutBranch(cwd, branchName, true)
      }

      let text = title
      const prepared = getPreparedTrelloExport(cardId)
      if (prepared) {
        text = prepared.text
      } else if (apiKey && token) {
        try {
          const result = await primeTrelloExport(apiKey, token, cardId)
          text = result.text
        } catch {}
      } else {
        try {
          const card = await window.trello.fetchCardWithSession(partition, cardId)
          if (card.desc) text = `${card.name}\n\n${card.desc}`
        } catch {}
      }

      const canvasEl = document.querySelector('[data-canvas-root]')
      const canvasRect = canvasEl?.getBoundingClientRect()
      if (!canvasRect) return

      const camera = useCameraStore.getState().camera
      const wx = (clientX - canvasRect.left - camera.x) / camera.zoom
      const wy = (clientY - canvasRect.top - camera.y) / camera.zoom

      const newNode = useNodeStore.getState().add(agentId, wx - 350, wy - 240, { cwd })
      const nodeId = newNode.id
      const capturedText = text
      setTimeout(() => { window.terminal.write(nodeId, capturedText + '\n') }, 1500)

      onClose()
    } catch (e) {
      console.error('[TrelloDropModal]', e)
    } finally {
      setLoading(false)
    }
  }, [autoBranch, branchBlocked, branchName, cardId, clientX, clientY, prefetchedCard, apiKey, token, partition, title, workspace?.path, onClose])

  const canToggleBranch = !branchBlocked

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
          borderRadius: 12, padding: 20, width: 340,
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
            Trello Card
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {title}
          </div>
        </div>

        {/* Branch toggle */}
        <div style={{
          marginBottom: 16, padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 8,
          border: `1px solid ${autoBranch && canToggleBranch ? 'rgba(0,121,191,0.35)' : 'rgba(255,255,255,0.07)'}`,
          opacity: branchBlocked ? 0.4 : 1, transition: 'border-color 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => canToggleBranch && setAutoBranch((v) => !v)}
              style={{
                width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                background: autoBranch && canToggleBranch ? '#0079BF' : 'rgba(255,255,255,0.12)',
                position: 'relative', cursor: canToggleBranch ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: autoBranch && canToggleBranch ? 15 : 2,
                width: 13, height: 13, borderRadius: '50%',
                background: '#fff', transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>
                Checkout new branch
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: branchBlocked
                  ? 'rgba(255,255,255,0.25)'
                  : autoBranch ? 'rgba(0,180,255,0.75)' : 'rgba(255,255,255,0.28)',
                fontFamily: 'monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {branchBlocked ? branchBlockReason : branchName}
              </div>
            </div>
          </div>
        </div>

        {/* Agents */}
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
              const isPrimary = agent.id === 'claude' || agent.id === 'codex'
              const borderColor = isOrchestrate ? 'rgba(52,211,153,0.25)' : isPrimary ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.08)'
              const bgColor = isOrchestrate ? 'rgba(52,211,153,0.07)' : isPrimary ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.04)'
              const borderHover = isOrchestrate ? 'rgba(52,211,153,0.45)' : isPrimary ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.15)'
              const bgHover = isOrchestrate ? 'rgba(52,211,153,0.14)' : isPrimary ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.07)'
              const iconColor = isOrchestrate ? 'rgba(52,211,153,0.9)' : isPrimary ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.45)'
              const iconBg = isOrchestrate ? 'rgba(52,211,153,0.15)' : isPrimary ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.07)'
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
                    Object.assign((e.currentTarget as HTMLElement).style, { background: bgColor, borderColor: borderColor })
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, background: iconBg,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: iconColor, flexShrink: 0,
                  }}>
                    {agent.icon}
                  </span>
                  {loading ? 'Starting…' : agent.label}
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
    document.body
  )
}
