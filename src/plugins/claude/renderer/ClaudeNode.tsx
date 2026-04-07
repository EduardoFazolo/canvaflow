import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { TerminalNode } from '../../../renderer/src/components/TerminalNode'

interface Props {
  node: NodeData
}

/**
 * Claude plugin node.
 *
 * Renders a TerminalNode with `shell: 'claude'` injected into props.
 * The cwd is set at creation time (workspace path) and persisted normally.
 *
 * If the node has an `agentSessionId` (set by the SessionStart hook in a
 * previous run), the shell becomes `claude --resume <id>` so the agent
 * picks up exactly where it left off across app restarts.
 */
export function ClaudeNode({ node }: Props): React.ReactElement {
  const claudeFlags = (node.props.claudeFlags as string) ?? ''
  const sessionId = node.agentSessionId

  const parts: string[] = ['claude']
  if (sessionId) parts.push('--resume', sessionId)
  if (claudeFlags) parts.push(claudeFlags)

  const claudeNode: NodeData = {
    ...node,
    props: {
      ...node.props,
      shell: parts.join(' '),
    },
  }
  return <TerminalNode node={claudeNode} />
}
