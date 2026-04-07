import React, { useEffect, useState } from 'react'
import { NodeData, freshlySpawnedAgentNodes } from '../../../renderer/src/stores/nodeStore'
import { TerminalNode } from '../../../renderer/src/components/TerminalNode'

interface Props {
  node: NodeData
}

/**
 * Per-app-session resolution of how each node should start claude. Computed
 * once per node and cached so re-renders don't re-trigger the async check.
 */
type ClaudeStartMode =
  | { kind: 'fresh-with-id'; sessionId: string }   // brand new agent, allocate session
  | { kind: 'resume'; sessionId: string }          // existing session, reattach
  | { kind: 'plain' }                              // no session info or stale — start clean
const startModeCache = new Map<string, ClaudeStartMode>()

/**
 * Synchronous resolution attempt — works for the common cases. Returns null if
 * we need to fall back to an async filesystem check (restart-resume path).
 */
function resolveStartModeSync(node: NodeData): ClaudeStartMode | null {
  const cached = startModeCache.get(node.id)
  if (cached) return cached

  const sessionId = node.agentSessionId
  if (!sessionId) {
    const mode: ClaudeStartMode = { kind: 'plain' }
    startModeCache.set(node.id, mode)
    return mode
  }
  if (freshlySpawnedAgentNodes.has(node.id)) {
    const mode: ClaudeStartMode = { kind: 'fresh-with-id', sessionId }
    startModeCache.set(node.id, mode)
    return mode
  }
  // Restart path — needs the async check
  return null
}

/**
 * Claude plugin node.
 *
 * Builds a `claude ...` shell command depending on the start mode:
 *   - fresh-with-id → `claude --session-id <uuid>`
 *   - resume        → `claude --resume <uuid>`
 *   - plain         → `claude`  (legacy nodes, stale sessions, no session)
 *
 * Most cases resolve synchronously. The restart-resume path needs an async
 * `fs.existsSync` IPC check to verify claude actually has a session JSONL for
 * the stored ID — otherwise we'd hit "No conversation found with session ID"
 * for any stale data.
 */
export function ClaudeNode({ node }: Props): React.ReactElement {
  const claudeFlags = (node.props.claudeFlags as string) ?? ''
  const [mode, setMode] = useState<ClaudeStartMode | null>(() => resolveStartModeSync(node))

  // Async resolution for the restart-resume path only.
  useEffect(() => {
    if (mode) return
    let cancelled = false
    const cwd = (node.props.cwd as string) || ''
    const sessionId = node.agentSessionId
    if (!sessionId) return
    void window.terminal.sessionExists(cwd, sessionId).then((exists) => {
      if (cancelled) return
      const resolved: ClaudeStartMode = exists
        ? { kind: 'resume', sessionId }
        : { kind: 'plain' }
      startModeCache.set(node.id, resolved)
      setMode(resolved)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  // While the async check is pending, render nothing — DO NOT spawn a PTY yet,
  // because we don't know which flags to pass. This typically lasts <5ms.
  if (!mode) {
    return <div style={{ width: node.width, height: node.height }} />
  }

  const parts: string[] = ['claude']
  if (mode.kind === 'fresh-with-id') {
    parts.push('--session-id', mode.sessionId)
  } else if (mode.kind === 'resume') {
    parts.push('--resume', mode.sessionId)
  }
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
