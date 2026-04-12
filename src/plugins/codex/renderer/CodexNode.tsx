import React from 'react'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { TerminalNode } from '../../../renderer/src/components/TerminalNode'

interface Props {
  node: NodeData
}

/**
 * Codex plugin node.
 *
 * Mirrors the Claude node's "terminal with a fixed CLI command" shape, but
 * Codex currently starts fresh each time — there is no per-node resume logic.
 */
export function CodexNode({ node }: Props): React.ReactElement {
  const codexFlags = (node.props.codexFlags as string) ?? ''

  const codexNode: NodeData = {
    ...node,
    props: {
      ...node.props,
      shell: codexFlags ? `codex ${codexFlags}` : 'codex',
    },
  }

  return <TerminalNode node={codexNode} />
}
