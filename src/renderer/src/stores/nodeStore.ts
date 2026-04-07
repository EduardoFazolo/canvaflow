import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { logAgentDebug } from '../../../modules/servers/agentic_signals/shared/debug'
import { useActivationStore } from './activationStore'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

export type NodeType = 'terminal' | 'browser' | 'browserv2' | 'note' | 'files' | 'notion' | 'trello' | 'claude' | 'monaco' | 'orchestrator' | 'subagent' | 'windowpicker' | 'kanban'

export interface NodeData {
  id: string
  type: NodeType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: boolean
  contentScale: number
  props: Record<string, unknown>
  // Spatial timestamp — from canvas_nodes table
  createdAt?: number
  // Metadata — persisted in node_metadata table (separate from spatial writes)
  lastFocusedAt?: number
  focusCount?: number
  totalFocusDuration?: number  // accumulated ms the node has been focused
  tags?: string[]
  description?: string
  pinned?: boolean
  /** Optional role tag for agent nodes (e.g. 'main', 'reviewer') — null/undefined for legacy or non-agents */
  agentRole?: string | null
  /** Claude Code session ID — populated by the SessionStart hook so the agent can be resumed across restarts */
  agentSessionId?: string | null
  // Agent status — ephemeral, reset on restart
  agentStatus?: AgentStatus
}

interface NodeStore {
  // Active workspace nodes (for all existing consumers — API unchanged)
  nodes: Map<string, NodeData>
  // All workspaces' nodes — kept alive so components never unmount on workspace switch
  workspaceNodes: Map<string, Map<string, NodeData>>
  activeWorkspaceId: string

  // When set, new nodes get this as their default cwd (used by worktree views)
  worktreeCwd: string | null
  setWorktreeCwd: (cwd: string | null) => void

  // Workspace management
  loadWorkspace: (wsId: string, nodes: Map<string, NodeData>) => void

  // Unchanged public API
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  add: (type: NodeType, x: number, y: number, props?: Record<string, unknown>) => NodeData
  /** Add a node explicitly to a specific canvas (bypasses activeWorkspaceId) */
  addToCanvas: (canvasId: string, type: NodeType, x: number, y: number, props?: Record<string, unknown>) => NodeData
  remove: (id: string) => void
  update: (id: string, patch: Partial<NodeData>) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  getMaxZIndex: () => number

  // Multi-select
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string>) => void
  clearSelection: () => void

  // Agent status & metadata
  setAgentStatus: (id: string, status: AgentStatus, message?: string) => void
  trackFocus: (id: string) => void
}

const DEFAULT_SIZES: Record<NodeType, { width: number; height: number }> = {
  terminal: { width: 600, height: 400 },
  browser: { width: 800, height: 600 },
  browserv2: { width: 800, height: 600 },
  note: { width: 300, height: 200 },
  files: { width: 700, height: 480 },
  notion: { width: 900, height: 700 },
  trello: { width: 900, height: 700 },
  claude: { width: 700, height: 480 },
  monaco: { width: 1000, height: 640 },
  orchestrator: { width: 520, height: 500 },
  subagent: { width: 460, height: 180 },
  windowpicker: { width: 480, height: 400 },
  kanban: { width: 980, height: 560 },
}

const DEFAULT_TITLES: Record<NodeType, string> = {
  terminal: 'Terminal',
  browser: 'Browser',
  browserv2: 'Browser',
  note: 'Note',
  files: 'Files',
  notion: 'Notion',
  trello: 'Trello',
  claude: 'Claude',
  monaco: 'Untitled',
  orchestrator: 'Orchestrator',
  subagent: 'Sub-agent',
  windowpicker: 'Window',
  kanban: 'Kanban Board',
}

// Sync helper: after mutating `nodes`, write it back into workspaceNodes
function syncBack(nodes: Map<string, NodeData>, s: NodeStore): Partial<NodeStore> {
  const workspaceNodes = new Map(s.workspaceNodes)
  workspaceNodes.set(s.activeWorkspaceId, nodes)
  return { nodes, workspaceNodes }
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: new Map(),
  workspaceNodes: new Map(),
  activeWorkspaceId: '',
  worktreeCwd: null,
  focusedNodeId: null,
  selectedNodeIds: new Set(),

  setWorktreeCwd: (cwd) => set({ worktreeCwd: cwd }),

  loadWorkspace: (wsId, nodes) => set((s) => {
    const workspaceNodes = new Map(s.workspaceNodes)
    workspaceNodes.set(wsId, nodes)
    return { nodes, workspaceNodes, activeWorkspaceId: wsId, focusedNodeId: null }
  }),

  setFocusedNodeId: (id) => set({ focusedNodeId: id }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  clearSelection: () => set({ selectedNodeIds: new Set() }),

  setAgentStatus: (id, status) => {
    set((s) => {
      let targetWorkspaceId: string | null = null
      let node = s.nodes.get(id)

      if (node) {
        targetWorkspaceId = s.activeWorkspaceId
      } else {
        for (const [workspaceId, workspaceNodes] of s.workspaceNodes.entries()) {
          const candidate = workspaceNodes.get(id)
          if (candidate) {
            targetWorkspaceId = workspaceId
            node = candidate
            break
          }
        }
      }

      if (!node || !targetWorkspaceId) return s
      logAgentDebug('node-store', 'set-agent-status', {
        nodeId: id,
        from: node.agentStatus ?? '',
        to: status,
        workspaceId: targetWorkspaceId,
        persistedToDb: false,
      })
      const updatedNode = { ...node, agentStatus: status }
      const workspaceNodes = new Map(s.workspaceNodes)
      const targetNodes = new Map(workspaceNodes.get(targetWorkspaceId) ?? [])
      targetNodes.set(id, updatedNode)
      workspaceNodes.set(targetWorkspaceId, targetNodes)

      if (targetWorkspaceId === s.activeWorkspaceId) {
        const nodes = new Map(s.nodes)
        nodes.set(id, updatedNode)
        return { nodes, workspaceNodes }
      }

      return { workspaceNodes }
    })
  },

  trackFocus: (id) => {
    const now = Date.now()
    const node = get().nodes.get(id)
    if (!node) return

    // Compute dwell time for the previously focused node (if any)
    const prevId = get().focusedNodeId
    let prevDwellPatch: { id: string; totalFocusDuration: number } | null = null
    if (prevId && prevId !== id) {
      const prev = get().nodes.get(prevId)
      if (prev?.lastFocusedAt) {
        const dwell = now - prev.lastFocusedAt
        // Only count reasonable dwells (< 30 min — ignore overnight/idle)
        if (dwell > 0 && dwell < 30 * 60 * 1000) {
          prevDwellPatch = { id: prevId, totalFocusDuration: (prev.totalFocusDuration ?? 0) + dwell }
        }
      }
    }

    // Single atomic state update for both nodes
    const focusCount = (node.focusCount ?? 0) + 1
    const lastFocusedAt = now
    set((s) => {
      const nodes = new Map(s.nodes)
      // Update previous node's dwell time
      if (prevDwellPatch) {
        const p = nodes.get(prevDwellPatch.id)
        if (p) nodes.set(prevDwellPatch.id, { ...p, totalFocusDuration: prevDwellPatch.totalFocusDuration })
      }
      // Update new node's focus metadata
      const n = nodes.get(id)
      if (!n) return s
      nodes.set(id, { ...n, focusCount, lastFocusedAt })
      return syncBack(nodes, s)
    })

    // Fire-and-forget persist — single IPC for new node (always needed)
    window.agent?.saveMetadata(id, { focusCount, lastFocusedAt }).catch(() => {})
    // Dwell persist only when there's something to save
    if (prevDwellPatch) {
      window.agent?.saveMetadata(prevDwellPatch.id, { totalFocusDuration: prevDwellPatch.totalFocusDuration }).catch(() => {})
    }
  },

  add: (type, x, y, props = {}) => {
    const id = nanoid()
    const zIndex = get().getMaxZIndex() + 1
    // When on a worktree view, ALWAYS override cwd — callers like context menu
    // and keyboard shortcuts pass getActiveWorkspace().path which is the main
    // workspace, not the worktree. worktreeCwd takes priority.
    const { worktreeCwd } = get()
    const finalProps = worktreeCwd ? { ...props, cwd: worktreeCwd } : props
    // Allocate a Claude session ID synchronously for claude nodes — must be on
    // the node BEFORE the first render so ClaudeNode sees it immediately and
    // passes `--session-id <uuid>` to claude. Deferring (setTimeout) creates a
    // race where ClaudeNode mounts first, sees null, and caches "plain" mode.
    const agentSessionId = type === 'claude' ? crypto.randomUUID() : undefined
    const node: NodeData = {
      id, type, x, y,
      ...DEFAULT_SIZES[type],
      zIndex,
      title: DEFAULT_TITLES[type],
      minimized: false,
      contentScale: 1,
      props: finalProps,
      createdAt: Date.now(),
      agentSessionId,
    }
    set((s) => {
      const nodes = new Map(s.nodes)
      nodes.set(id, node)
      return { ...syncBack(nodes, s), focusedNodeId: id }
    })
    // Mark fresh + persist the session ID to DB (fire-and-forget)
    if (agentSessionId) {
      freshlySpawnedAgentNodes.add(id)
      void window.agent.saveMetadata(id, { agentSessionId })
    }
    // Freshly created nodes activate immediately — no "Click to start" gate.
    // The staggered queue is only for bulk-loading from DB on startup.
    useActivationStore.getState().activateNow(id)
    const activeCanvasId = get().activeWorkspaceId
    maybeAutoTagAsMain(id, activeCanvasId, type)
    return node
  },

  addToCanvas: (canvasId, type, x, y, props = {}) => {
    const id = nanoid()
    const zIndex = get().getMaxZIndex() + 1
    const { worktreeCwd } = get()
    const finalProps = worktreeCwd ? { ...props, cwd: worktreeCwd } : props
    // Allocate session ID synchronously — see add() for the rationale.
    const agentSessionId = type === 'claude' ? crypto.randomUUID() : undefined
    const node: NodeData = {
      id, type, x, y,
      ...DEFAULT_SIZES[type],
      zIndex,
      title: DEFAULT_TITLES[type],
      minimized: false,
      contentScale: 1,
      props: finalProps,
      createdAt: Date.now(),
      agentSessionId,
    }
    set((s) => {
      // Add to the SPECIFIED canvas, not whatever activeWorkspaceId happens to be
      const targetNodes = new Map(s.workspaceNodes.get(canvasId) ?? new Map())
      targetNodes.set(id, node)
      const workspaceNodes = new Map(s.workspaceNodes)
      workspaceNodes.set(canvasId, targetNodes)
      // If this IS the active canvas, also update `nodes` so the UI renders it
      if (s.activeWorkspaceId === canvasId) {
        return { nodes: targetNodes, workspaceNodes, focusedNodeId: id }
      }
      return { workspaceNodes }
    })
    if (agentSessionId) {
      freshlySpawnedAgentNodes.add(id)
      void window.agent.saveMetadata(id, { agentSessionId })
    }
    useActivationStore.getState().activateNow(id)
    maybeAutoTagAsMain(id, canvasId, type)
    return node
  },

  remove: (id) => set((s) => {
    const nodes = new Map(s.nodes)
    nodes.delete(id)
    return syncBack(nodes, s)
  }),

  update: (id, patch) => set((s) => {
    // Try the active canvas first (the common case)
    const activeNode = s.nodes.get(id)
    if (activeNode) {
      const nodes = new Map(s.nodes)
      nodes.set(id, { ...activeNode, ...patch })
      return syncBack(nodes, s)
    }
    // Fall back: search all workspace canvases. spawnAgent often updates a
    // node on a worktree canvas that isn't currently visible (e.g. AI Review
    // spawning into a hidden canvas), so the active-canvas-only path would
    // silently drop the patch.
    for (const [canvasId, canvasNodes] of s.workspaceNodes.entries()) {
      const node = canvasNodes.get(id)
      if (!node) continue
      const updated = new Map(canvasNodes)
      updated.set(id, { ...node, ...patch })
      const workspaceNodes = new Map(s.workspaceNodes)
      workspaceNodes.set(canvasId, updated)
      return { workspaceNodes }
    }
    return s
  }),

  bringToFront: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, zIndex: get().getMaxZIndex() + 1 })
    return syncBack(nodes, s)
  }),

  sendToBack: (id) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    const minZ = Math.min(...Array.from(s.nodes.values()).map(n => n.zIndex))
    nodes.set(id, { ...node, zIndex: minZ - 1 })
    return syncBack(nodes, s)
  }),

  getMaxZIndex: () => {
    const { nodes } = get()
    if (nodes.size === 0) return 0
    return Math.max(...Array.from(nodes.values()).map(n => n.zIndex))
  },
}))

// ---------------------------------------------------------------------------
// Tracks claude nodes that were freshly spawned in the current app session.
// ClaudeNode reads this to decide whether to use `--session-id <uuid>` (fresh,
// claude creates the session) vs `--resume <uuid>` (restart, reattach to an
// existing session). Module-level so it survives remounts but resets on app
// restart — exactly the lifetime we want.
// ---------------------------------------------------------------------------
export const freshlySpawnedAgentNodes = new Set<string>()

// ---------------------------------------------------------------------------
// Auto-tag the first agent on a canvas as the "main" agent.
//
// Runs on the next tick so that any explicit role assigned by spawnAgent
// (e.g. role: 'reviewer') has already been applied — in which case this
// no-ops because the node is already tagged.
// ---------------------------------------------------------------------------
function maybeAutoTagAsMain(nodeId: string, canvasId: string, type: NodeType): void {
  if (type !== 'claude' && type !== 'orchestrator') return
  setTimeout(() => {
    const store = useNodeStore.getState()
    const canvasNodes = store.workspaceNodes.get(canvasId)
    if (!canvasNodes) return
    const node = canvasNodes.get(nodeId)
    if (!node || node.agentRole) return // gone, or already explicitly tagged

    // Skip if any other agent on this canvas is already the main one.
    // Subagents (children of an orchestrator) don't count.
    const subagentIds = new Set<string>()
    for (const n of canvasNodes.values()) {
      if (n.type === 'orchestrator') {
        const ids = (n.props.subagentIds as string[] | undefined) ?? []
        for (const id of ids) subagentIds.add(id)
      }
    }
    const hasMain = Array.from(canvasNodes.values()).some((n) =>
      n.id !== nodeId && n.agentRole === 'main' && !subagentIds.has(n.id)
    )
    if (hasMain) return

    // Tag this one as main, both in memory and persisted
    store.update(nodeId, { agentRole: 'main' })
    void window.agent.saveMetadata(nodeId, { agentRole: 'main' })
  }, 0)
}
