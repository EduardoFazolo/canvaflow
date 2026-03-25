/**
 * ClusterLayerV2 — renders behind all nodes inside the CanvasOverlay.
 * For each orchestrator-v2 node, draws:
 *   1. A rounded bounding box around the orchestrator + its repo agents
 *   2. Animated wires from orchestrator to each agent — colored per agent
 */
import React from 'react'
import { useNodeStore, NodeData } from '../../../renderer/src/stores/nodeStore'
import { AGENT_COLORS } from '../shared/types'

const TITLE_H = 32
const PAD = 36
const BORDER_R = 16

interface Cluster {
  orchestrator: NodeData
  agents: NodeData[]
}

export function ClusterLayerV2(): React.ReactElement | null {
  const nodes = useNodeStore((s) => s.nodes)

  const clusters: Cluster[] = []
  for (const node of nodes.values()) {
    if (node.type !== 'orchestrator-v2') continue
    const agentIds = (node.props?.agentIds as string[] | undefined) ?? []
    if (agentIds.length === 0) continue
    const agents: NodeData[] = []
    for (const id of agentIds) {
      const sub = nodes.get(id)
      if (sub) agents.push(sub)
    }
    if (agents.length > 0) {
      clusters.push({ orchestrator: node, agents })
    }
  }

  if (clusters.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <style>{`
          @keyframes orcv2-wire-flow {
            from { stroke-dashoffset: 20; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes orcv2-wire-pulse {
            0%, 100% { opacity: 0.06; }
            50%       { opacity: 0.16; }
          }
          @keyframes orcv2-boundary-pulse {
            0%, 100% { opacity: 0.3; }
            50%       { opacity: 0.5; }
          }
        `}</style>
      </defs>

      {clusters.map(({ orchestrator, agents }) => {
        const allNodes = [orchestrator, ...agents]
        const status = (orchestrator.props?.status as string) ?? 'idle'
        const isActiveStatus = status === 'thinking' || status === 'streaming' || status === 'cloning' || status === 'spawning' || status === 'monitoring' || status === 'merging' || status === 'parsing'
        const isDone = status === 'done'
        const isError = status === 'error'

        // Bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const n of allNodes) {
          const h = n.minimized ? TITLE_H : n.height
          if (n.x < minX) minX = n.x
          if (n.y < minY) minY = n.y
          if (n.x + n.width > maxX) maxX = n.x + n.width
          if (n.y + h > maxY) maxY = n.y + h
        }

        const bx = minX - PAD
        const by = minY - PAD
        const bw = maxX - minX + PAD * 2
        const bh = maxY - minY + PAD * 2

        const boundaryColor = isError ? '#f87171' : isDone ? '#4ade80' : '#f59e0b'
        const boundaryOpacity = isActiveStatus ? 0.5 : isDone ? 0.25 : isError ? 0.3 : 0.2
        const gradId = `orcv2-cluster-${orchestrator.id}`

        // Orchestrator anchor: right-center
        const ox = orchestrator.x + orchestrator.width
        const oy = orchestrator.y + (orchestrator.minimized ? TITLE_H / 2 : orchestrator.height / 2)

        return (
          <g key={orchestrator.id}>
            {/* Boundary */}
            <rect
              x={bx} y={by}
              width={bw} height={bh}
              rx={BORDER_R} ry={BORDER_R}
              fill={boundaryColor}
              fillOpacity={0.015}
              stroke={boundaryColor}
              strokeWidth={1.5}
              strokeOpacity={boundaryOpacity}
              strokeDasharray={isActiveStatus ? '6 4' : 'none'}
              style={isActiveStatus ? { animation: 'orcv2-boundary-pulse 2s ease-in-out infinite' } : undefined}
            />

            {/* Corner label */}
            <text
              x={bx + 10} y={by + 14}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
              fontWeight={600}
              fill={boundaryColor}
              opacity={0.4}
              letterSpacing="0.06em"
            >
              CLUSTER V2
            </text>

            {/* Wires — each colored by agent */}
            {agents.map((agent, idx) => {
              const colorIndex = (agent.props?.colorIndex as number) ?? idx
              const agentColor = AGENT_COLORS[colorIndex % AGENT_COLORS.length]

              const sx = agent.x
              const sy = agent.y + (agent.minimized ? TITLE_H / 2 : agent.height / 2)

              const span = Math.abs(sx - ox)
              const pull = Math.max(span * 0.4, 50)
              const cx1 = ox + pull
              const cx2 = sx - pull
              const d = `M ${ox} ${oy} C ${cx1} ${oy} ${cx2} ${sy} ${sx} ${sy}`
              const wireGradId = `${gradId}-wire-${agent.id}`

              return (
                <g key={agent.id}>
                  <defs>
                    <linearGradient
                      id={wireGradId}
                      x1={ox} y1={oy}
                      x2={sx} y2={sy}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={agentColor} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={agentColor} />
                    </linearGradient>
                  </defs>

                  {/* Soft glow */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={6}
                    fill="none"
                    style={{ animation: 'orcv2-wire-pulse 2.4s ease-in-out infinite' }}
                  />

                  {/* Solid baseline */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={1}
                    fill="none"
                    opacity={0.2}
                  />

                  {/* Flowing dashes */}
                  <path
                    d={d}
                    stroke={`url(#${wireGradId})`}
                    strokeWidth={1.5}
                    fill="none"
                    strokeDasharray="4 16"
                    opacity={0.8}
                    style={{ animation: 'orcv2-wire-flow 1s linear infinite' }}
                  />

                  {/* Source dot (orchestrator side — amber) */}
                  <circle cx={ox} cy={oy} r={3} fill="#f59e0b" opacity={0.5} />
                  <circle cx={ox} cy={oy} r={5} fill="none" stroke="#f59e0b" strokeWidth={0.8} opacity={0.15} />

                  {/* Target dot (agent side — agent color) */}
                  <circle cx={sx} cy={sy} r={3.5} fill={agentColor} opacity={0.7} />
                  <circle cx={sx} cy={sy} r={6} fill="none" stroke={agentColor} strokeWidth={0.8} opacity={0.2} />
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
