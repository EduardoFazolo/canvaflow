import React from 'react'
import { useNodeStore, NodeData } from '../stores/nodeStore'

const TITLE_H = 32

interface Connection {
  agentNode: NodeData    // node that owns connectedNodeId
  lovableNode: NodeData  // the node it is connected to
}

function agentAccent(node: NodeData): string {
  if (node.type === 'codex') return '#2dd4bf'
  return '#a78bfa'
}

export function ConnectionLayer(): React.ReactElement | null {
  const nodes = useNodeStore((s) => s.nodes)

  const connections: Connection[] = []
  for (const node of nodes.values()) {
    const connectedId = node.props?.connectedNodeId as string | undefined
    if (!connectedId) continue
    const lovable = nodes.get(connectedId)
    if (!lovable) continue
    connections.push({ agentNode: node, lovableNode: lovable })
  }

  if (connections.length === 0) return null

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
          @keyframes cf-wire-flow {
            from { stroke-dashoffset: 18; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes cf-wire-pulse {
            0%, 100% { opacity: 0.12; }
            50%       { opacity: 0.22; }
          }
        `}</style>
      </defs>

      {connections.map(({ agentNode, lovableNode }) => {
        const accent = agentAccent(agentNode)
        // Right-center of the Lovable browser node
        const x1 = lovableNode.x + lovableNode.width
        const y1 = lovableNode.y + (lovableNode.minimized ? TITLE_H / 2 : lovableNode.height / 2)

        // Left-center of the connected agent node
        const x2 = agentNode.x
        const y2 = agentNode.y + (agentNode.minimized ? TITLE_H / 2 : agentNode.height / 2)

        // Horizontal bezier control points
        const span = Math.abs(x2 - x1)
        const pull = Math.max(span * 0.45, 60)
        const cx1 = x1 + pull
        const cx2 = x2 - pull

        const d = `M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`
        const gradId = `cf-wire-${agentNode.id}`

        return (
          <g key={agentNode.id}>
            <defs>
              <linearGradient
                id={gradId}
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%"   stopColor="#fb923c" />
                <stop offset="100%" stopColor={accent} />
              </linearGradient>
            </defs>

            {/* Soft glow behind the wire */}
            <path
              d={d}
              stroke={`url(#${gradId})`}
              strokeWidth={8}
              fill="none"
              style={{ animation: 'cf-wire-pulse 2.4s ease-in-out infinite' }}
            />

            {/* Solid baseline — very subtle */}
            <path
              d={d}
              stroke={`url(#${gradId})`}
              strokeWidth={1}
              fill="none"
              opacity={0.25}
            />

            {/* Flowing dashes */}
            <path
              d={d}
              stroke={`url(#${gradId})`}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="5 13"
              opacity={0.9}
              style={{ animation: 'cf-wire-flow 0.85s linear infinite' }}
            />

            {/* Source dot (Lovable / orange) */}
            <circle cx={x1} cy={y1} r={3} fill="#fb923c" opacity={0.7} />
            <circle cx={x1} cy={y1} r={5.5} fill="none" stroke="#fb923c" strokeWidth={1} opacity={0.25} />

            {/* Target dot (agent) */}
            <circle cx={x2} cy={y2} r={3} fill={accent} opacity={0.7} />
            <circle cx={x2} cy={y2} r={5.5} fill="none" stroke={accent} strokeWidth={1} opacity={0.25} />
          </g>
        )
      })}
    </svg>
  )
}
