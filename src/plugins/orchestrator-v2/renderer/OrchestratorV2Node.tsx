import React, { useRef, useEffect } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { AGENT_COLORS } from '../shared/types'
import type { OrcV2Status, MergeProgressEvent } from '../shared/types'

interface CommitEntry {
  agentId: string
  hash: string
  message: string
  filesChanged: string[]
  timestamp: number
}

interface ConflictEntry {
  targetAgentId: string
  sourceAgentId: string
  conflictingFiles: string[]
}

interface OrcV2Props {
  task: string
  status: OrcV2Status
  message?: string
  streamText?: string
  agentIds: string[]
  commits?: CommitEntry[]
  conflicts?: ConflictEntry[]
  mergeProgress?: MergeProgressEvent[]
  workspacePath?: string
}

interface Props {
  node: NodeData
}

const STATUS_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  streaming: '#a78bfa',
  parsing: '#818cf8',
  cloning: '#06b6d4',
  spawning: '#60a5fa',
  monitoring: '#f59e0b',
  merging: '#e879f9',
  done: '#4ade80',
  error: '#f87171',
  idle: 'rgba(255,255,255,0.2)',
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Thinking…',
  streaming: 'Responding…',
  parsing: 'Parsing…',
  cloning: 'Cloning repos…',
  spawning: 'Spawning agents…',
  monitoring: 'Monitoring commits…',
  merging: 'Merging branches…',
  done: 'Done',
  error: 'Error',
  idle: 'Ready',
}

const isActive = (s: string): boolean =>
  s === 'thinking' || s === 'streaming' || s === 'parsing' || s === 'cloning' || s === 'spawning' || s === 'monitoring' || s === 'merging'

export function OrchestratorV2Node({ node }: Props): React.ReactElement {
  const props = node.props as Partial<OrcV2Props>
  const status = props.status ?? 'idle'
  const task = props.task ?? ''
  const message = props.message ?? STATUS_LABELS[status]
  const streamText = props.streamText ?? ''
  const agentIds = props.agentIds ?? []
  const commits = props.commits ?? []
  const conflicts = props.conflicts ?? []
  const mergeProgress = props.mergeProgress ?? []
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle
  const streamRef = useRef<HTMLDivElement>(null)
  const commitsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [streamText])

  useEffect(() => {
    if (commitsRef.current) commitsRef.current.scrollTop = commitsRef.current.scrollHeight
  }, [commits.length])

  const titleExtra = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>V2</span>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: statusColor,
        boxShadow: status !== 'idle' ? `0 0 5px ${statusColor}` : undefined,
        flexShrink: 0,
        animation: isActive(status) ? 'orcv2-pulse 1.4s ease-in-out infinite' : undefined,
      }} />
    </div>
  )

  return (
    <BaseNode node={node} titleExtra={titleExtra}>
      <div style={{
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
        height: '100%', overflow: 'auto', boxSizing: 'border-box',
      }}>
        {/* Task */}
        <div>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
          }}>Task</div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.45,
          }}>{task}</div>
        </div>

        {/* Status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
            boxShadow: status !== 'idle' ? `0 0 4px ${statusColor}` : undefined,
            animation: isActive(status) ? 'orcv2-pulse 1.4s ease-in-out infinite' : undefined,
          }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {message}
          </span>
        </div>

        {/* Stream output */}
        {streamText && (status === 'streaming' || status === 'thinking') && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
            }}>Response</div>
            <div
              ref={streamRef}
              style={{
                fontSize: 11, fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.6)', lineHeight: 1.5,
                padding: '8px 10px',
                background: 'rgba(167,139,250,0.06)',
                borderRadius: 6,
                border: '1px solid rgba(167,139,250,0.12)',
                maxHeight: 140, overflow: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >{streamText}</div>
          </div>
        )}

        {/* Error details */}
        {status === 'error' && message && message.length > 60 && (
          <div style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(248,113,113,0.8)', lineHeight: 1.4,
            padding: '8px 10px',
            background: 'rgba(248,113,113,0.06)',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.12)',
            maxHeight: 120, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{message}</div>
        )}

        {/* Repo Agents — each with its assigned color */}
        {agentIds.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>Repo Agents ({agentIds.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {agentIds.map((id, idx) => (
                <AgentRef key={id} nodeId={id} colorIndex={idx} />
              ))}
            </div>
          </div>
        )}

        {/* Conflict warnings */}
        {conflicts.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(248,113,113,0.6)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>Conflicts ({conflicts.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{
                  fontSize: 11, fontFamily: 'monospace',
                  color: 'rgba(248,113,113,0.7)', lineHeight: 1.4,
                  padding: '5px 8px',
                  background: 'rgba(248,113,113,0.05)',
                  borderRadius: 5,
                  border: '1px solid rgba(248,113,113,0.12)',
                }}>
                  {c.conflictingFiles.map((f) => f.split('/').slice(-2).join('/')).join(', ')}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent commits — color-coded by agent */}
        {commits.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>Recent Commits ({commits.length})</div>
            <div
              ref={commitsRef}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                maxHeight: 140, overflow: 'auto',
              }}
            >
              {commits.slice(-20).map((commit, i) => {
                const agentIdx = agentIds.indexOf(commit.agentId)
                const color = AGENT_COLORS[agentIdx % AGENT_COLORS.length] ?? '#a78bfa'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px',
                    fontSize: 11, fontFamily: 'monospace',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: color, flexShrink: 0,
                      boxShadow: `0 0 3px ${color}`,
                    }} />
                    <span style={{
                      color, fontSize: 10, fontWeight: 600, flexShrink: 0,
                      opacity: 0.7,
                    }}>
                      {commit.hash.slice(0, 7)}
                    </span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {commit.message}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Merge progress */}
        {mergeProgress.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
            }}>Merge Progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {mergeProgress.map((mp, i) => {
                const mergeColor = mp.status === 'merged' ? '#4ade80'
                  : mp.status === 'conflict' ? '#f87171'
                  : mp.status === 'merging' ? '#e879f9'
                  : 'rgba(255,255,255,0.3)'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px',
                    fontSize: 11, fontFamily: 'monospace',
                    color: 'rgba(255,255,255,0.5)',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 5,
                    borderLeft: `3px solid ${mergeColor}`,
                  }}>
                    <span style={{ color: mergeColor, fontWeight: 600 }}>
                      {mp.branch}
                    </span>
                    <span>— {mp.status}{mp.message ? `: ${mp.message.slice(0, 60)}` : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes orcv2-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </BaseNode>
  )
}

function AgentRef({ nodeId, colorIndex }: { nodeId: string; colorIndex: number }): React.ReactElement {
  const node = useNodeStore((s) => s.nodes.get(nodeId))
  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]

  if (!node) return <></>

  const branch = (node.props as any)?.branch ?? ''

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 8px',
      background: `${color}08`,
      borderRadius: 5,
      border: `1px solid ${color}25`,
      fontSize: 12, color: 'rgba(255,255,255,0.6)',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, flexShrink: 0,
        boxShadow: `0 0 4px ${color}`,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {node.title}
      </span>
      {branch && (
        <span style={{
          fontSize: 10, fontFamily: 'monospace',
          color: `${color}99`,
          flexShrink: 0,
        }}>
          {branch}
        </span>
      )}
    </div>
  )
}
