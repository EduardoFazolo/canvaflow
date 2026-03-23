import React, { useCallback } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData, NodeType } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { getAgentTerminalPlugins } from '../../agentTerminal'

interface SubagentProps {
  task: string
  note?: string
  orchestratorId?: string
}

interface Props {
  node: NodeData
}

export function SubagentNode({ node }: Props): React.ReactElement {
  const { add } = useNodeStore()
  const props = node.props as Partial<SubagentProps>
  const task = props.task ?? ''
  const note = props.note
  const agentPlugins = getAgentTerminalPlugins()

  const handleLaunchAgent = useCallback((agentType: string) => {
    // Place the agent node to the right of this subagent
    const cx = node.x + node.width + 60
    const cy = node.y

    const newNode = add(agentType as NodeType, cx, cy, {})
    // Write the task into the terminal after a short delay for it to start
    setTimeout(() => {
      window.terminal.write(newNode.id, task + '\n')
    }, 1500)
  }, [node.x, node.y, node.width, task, add])

  return (
    <BaseNode node={node}>
      <div style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Task description */}
        <div style={{
          flex: 1, padding: '12px 14px',
          overflow: 'auto',
          fontSize: 12, color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.55,
        }}>
          {task}
        </div>

        {/* Live note (updated by orchestrator) */}
        {note && (
          <div style={{
            margin: '0 10px 8px',
            padding: '7px 10px',
            background: 'rgba(167,139,250,0.07)',
            borderRadius: 6,
            border: '1px solid rgba(167,139,250,0.15)',
            fontSize: 11, color: 'rgba(167,139,250,0.8)',
            lineHeight: 1.5,
          }}>
            {note}
          </div>
        )}

        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agentPlugins.map((plugin) => (
            <button
              key={plugin.nodeType}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => handleLaunchAgent(plugin.nodeType)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 6,
                background: 'rgba(167,139,250,0.1)',
                border: '1px solid rgba(167,139,250,0.25)',
                color: 'rgba(167,139,250,0.85)',
                fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(167,139,250,0.18)',
                borderColor: 'rgba(167,139,250,0.45)',
              })}
              onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(167,139,250,0.1)',
                borderColor: 'rgba(167,139,250,0.25)',
              })}
            >
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
              </svg>
              {`Launch ${plugin.defaultTitle}`}
            </button>
          ))}
        </div>
      </div>
    </BaseNode>
  )
}
