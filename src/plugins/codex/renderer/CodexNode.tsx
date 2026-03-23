import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { TerminalNode } from '../../../renderer/src/components/TerminalNode'

interface Props {
  node: NodeData
}

/**
 * Codex plugin node.
 *
 * Renders a TerminalNode with `shell: 'codex'` injected into props.
 * The cwd is set at creation time (workspace path) and persisted normally.
 */
export function CodexNode({ node }: Props): React.ReactElement {
  const codexNode: NodeData = {
    ...node,
    props: {
      ...node.props,
      shell: 'codex',
    },
  }
  return <TerminalNode node={codexNode} />
}
