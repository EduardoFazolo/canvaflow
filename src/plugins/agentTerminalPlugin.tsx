import React from 'react'
import { TerminalNode } from '../renderer/src/components/TerminalNode'
import type { NodeData } from '../renderer/src/stores/nodeStore'
import type { AgentTerminalPlugin } from './agentTerminal'

interface AgentTerminalPluginFactoryOptions {
  id: string
  nodeType: string
  title: string
  shell: string
  shortcut: string
  sidebarLabel?: string
  defaultSize?: { readonly width: number; readonly height: number }
}

function createAgentTerminalNodeComponent(shell: string, title: string): React.ComponentType<{ node: NodeData }> {
  function AgentTerminalNode({ node }: { node: NodeData }): React.ReactElement {
    const agentNode: NodeData = {
      ...node,
      props: {
        ...node.props,
        shell,
      },
    }
    return <TerminalNode node={agentNode} />
  }

  AgentTerminalNode.displayName = `${title}Node`
  return AgentTerminalNode
}

export function createAgentTerminalPlugin(
  options: AgentTerminalPluginFactoryOptions,
): AgentTerminalPlugin {
  return {
    id: options.id,
    nodeType: options.nodeType,
    defaultSize: options.defaultSize ?? { width: 700, height: 480 },
    defaultTitle: options.title,
    component: createAgentTerminalNodeComponent(options.shell, options.title),
    keepAlive: true,
    sidebarLabel: options.sidebarLabel ?? options.title,
    shortcut: options.shortcut,
    agentTerminal: {
      shell: options.shell,
    },
  }
}
