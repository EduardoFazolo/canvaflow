import React, { useEffect, useRef } from 'react'
import { useNodeStore, NodeData } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useVisibleNodes, useVisibleNodeIds } from '../hooks/useVisibleNodes'
import { TerminalNode } from './TerminalNode'
import { BrowserNode } from './BrowserNode'
import { BrowserNodeV2 } from './BrowserNodeV2'
import { FilesNode } from './FilesNode'
import { NoteNode } from './NoteNode'
import { pluginRegistry } from '../../../plugins/types'
import { resumeNode, suspendNode } from '../hooks/useNodeLifecycle'

function NodeRenderer({ node }: { node: NodeData }): React.ReactElement | null {
  if (node.type === 'terminal') return <TerminalNode key={node.id} node={node} />
  if (node.type === 'browser') return <BrowserNode key={node.id} node={node} />
  if (node.type === 'browserv2') return <BrowserNodeV2 key={node.id} node={node} />
  if (node.type === 'files') return <FilesNode key={node.id} node={node} />
  if (node.type === 'note') return <NoteNode key={node.id} node={node} />
  const plugin = pluginRegistry.get(node.type)
  if (plugin) return <plugin.component key={node.id} node={node} />
  return null
}

const MemoNodeRenderer = React.memo(NodeRenderer, (prev, next) => prev.node === next.node)

/**
 * Tracks visible node set changes and calls lifecycle suspend/resume + plugin hooks.
 */
function useLifecycleTransitions(visibleIds: Set<string>): void {
  const prevIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const prev = prevIds.current

    // Nodes that just became visible → resume
    for (const id of visibleIds) {
      if (!prev.has(id)) {
        resumeNode(id)
        const node = useNodeStore.getState().nodes.get(id)
        if (node) pluginRegistry.get(node.type)?.lifecycle?.onResume?.(id)
      }
    }

    // Nodes that just left the viewport → suspend
    for (const id of prev) {
      if (!visibleIds.has(id)) {
        suspendNode(id)
        const node = useNodeStore.getState().nodes.get(id)
        if (node) pluginRegistry.get(node.type)?.lifecycle?.onSuspend?.(id)
      }
    }

    prevIds.current = visibleIds
  }, [visibleIds])
}

function shouldKeepAlive(node: NodeData): boolean {
  if (node.type === 'terminal' || node.type === 'browser' || node.type === 'browserv2') return true
  return pluginRegistry.get(node.type)?.keepAlive ?? false
}

export function NodeLayer(): React.ReactElement {
  const activeWorkspaceId = useNodeStore((s) => s.activeWorkspaceId)
  const workspaceNodes = useNodeStore((s) => s.workspaceNodes)
  const activeNodes = useNodeStore((s) => s.nodes)
  const camera = useCameraStore((s) => s.camera)
  const visibleActive = useVisibleNodes(activeNodes, camera)
  const visibleIds = useVisibleNodeIds(activeNodes, camera)

  // Drive lifecycle suspend/resume based on viewport transitions
  useLifecycleTransitions(visibleIds)

  return (
    <>
      {Array.from(workspaceNodes.entries()).map(([wsId, nodes]) => {
        const isActive = wsId === activeWorkspaceId
        // Active workspace: viewport-culled set. Inactive: only keep-alive nodes (to stay mounted).
        const toRender = isActive
          ? visibleActive
          : Array.from(nodes.values()).filter(shouldKeepAlive)

        return (
          // display:contents for active = transparent wrapper, no layout effect.
          // display:none for inactive = hidden but children stay mounted in React.
          // The wrapper key is stable across switches, so children never remount.
          <div key={wsId} style={{ display: isActive ? 'contents' : 'none' }}>
            {toRender.map((node) => <MemoNodeRenderer key={node.id} node={node} />)}
          </div>
        )
      })}
    </>
  )
}
