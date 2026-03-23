import React, { useEffect, useRef } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'

interface OrchestratorProps {
  task: string
  status: 'idle' | 'thinking' | 'done' | 'error'
  message?: string
  streamText?: string
  subagentIds: string[]
}

interface Props {
  node: NodeData
}

const STATUS_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  done: '#4ade80',
  error: '#f87171',
  idle: 'rgba(255,255,255,0.2)',
}

export function OrchestratorNode({ node }: Props): React.ReactElement {
  const props = node.props as Partial<OrchestratorProps>
  const status = props.status ?? 'idle'
  const task = props.task ?? ''
  const message = props.message ?? ''
  const streamText = props.streamText ?? ''
  const subagentIds = props.subagentIds ?? []
  const statusColor = STATUS_COLORS[status]
  const streamRef = useRef<HTMLDivElement>(null)

  // Auto-scroll stream to bottom
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [streamText])

  const titleExtra = (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: statusColor,
      boxShadow: status !== 'idle' ? `0 0 5px ${statusColor}` : undefined,
      flexShrink: 0,
      animation: status === 'thinking' ? 'orch-pulse 1.4s ease-in-out infinite' : undefined,
    }} />
  )

  return (
    <BaseNode node={node} titleExtra={titleExtra}>
      <div style={{
        padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
        height: '100%', overflow: 'hidden', boxSizing: 'border-box',
      }}>
        {/* Task */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3,
          }}>
            Task
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.4,
          }}>
            {task}
          </div>
        </div>

        {/* Live stream — Claude's response as it comes in */}
        {(status === 'thinking' || (status === 'error' && !subagentIds.length)) && (
          <div
            ref={streamRef}
            style={{
              flex: 1, minHeight: 0,
              overflow: 'auto',
              padding: '8px 10px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: 1.6,
              color: status === 'error' ? 'rgba(248,113,113,0.85)' : 'rgba(255,255,255,0.55)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {streamText || message || (status === 'thinking' ? 'Waiting for Claude…' : '')}
            {status === 'thinking' && (
              <span style={{
                display: 'inline-block',
                width: 6, height: 12,
                background: 'rgba(167,139,250,0.6)',
                marginLeft: 2,
                animation: 'orch-cursor 0.8s step-end infinite',
              }} />
            )}
          </div>
        )}

        {/* Done/error status bar */}
        {status !== 'thinking' && (status === 'done' || (status === 'error' && subagentIds.length > 0)) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor, flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {message}
            </span>
          </div>
        )}

        {/* Sub-agents list */}
        {subagentIds.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
            }}>
              Sub-agents ({subagentIds.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {subagentIds.map((id) => (
                <SubagentRef key={id} nodeId={id} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes orch-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        @keyframes orch-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </BaseNode>
  )
}

function SubagentRef({ nodeId }: { nodeId: string }): React.ReactElement {
  const node = useNodeStore((s) => s.nodes.get(nodeId))
  if (!node) return <></>

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '4px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 5,
      border: '1px solid rgba(255,255,255,0.06)',
      fontSize: 11, color: 'rgba(255,255,255,0.6)',
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'rgba(52,211,153,0.7)', flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </span>
    </div>
  )
}
