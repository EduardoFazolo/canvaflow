import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { logAgentDebug } from '../../../modules/servers/agentic_signals/shared/debug'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

export type NodeType = 'terminal' | 'browser' | 'browserv2' | 'note' | 'files' | 'notion' | 'trello' | 'claude' | 'monaco' | 'orchestrator' | 'subagent' | 'windowpicker' | 'orchestrator-v2' | 'repo-agent'

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
  // Agent status — ephemeral, reset on restart
  agentStatus?: AgentStatus
}

interface NodeStore {
  // Active workspace nodes (for all existing consumers — API unchanged)
  nodes: Map<string, NodeData>
  // All workspaces' nodes — kept alive so components never unmount on workspace switch
  workspaceNodes: Map<string, Map<string, NodeData>>
  activeWorkspaceId: string

  // Workspace management
  loadWorkspace: (wsId: string, nodes: Map<string, NodeData>) => void

  // Unchanged public API
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  add: (type: NodeType, x: number, y: number, props?: Record<string, unknown>) => NodeData
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
  'orchestrator-v2': { width: 560, height: 340 },
  'repo-agent': { width: 480, height: 220 },
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
  'orchestrator-v2': 'Orchestrator V2',
  'repo-agent': 'Repo Agent',
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
  focusedNodeId: null,
  selectedNodeIds: new Set(),

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
    const node: NodeData = {
      id, type, x, y,
      ...DEFAULT_SIZES[type],
      zIndex,
      title: DEFAULT_TITLES[type],
      minimized: false,
      contentScale: 1,
      props,
      createdAt: Date.now(),
    }
    set((s) => {
      const nodes = new Map(s.nodes)
      nodes.set(id, node)
      return { ...syncBack(nodes, s), focusedNodeId: id }
    })
    return node
  },

  remove: (id) => set((s) => {
    const nodes = new Map(s.nodes)
    nodes.delete(id)
    return syncBack(nodes, s)
  }),

  update: (id, patch) => set((s) => {
    const node = s.nodes.get(id)
    if (!node) return s
    const nodes = new Map(s.nodes)
    nodes.set(id, { ...node, ...patch })
    return syncBack(nodes, s)
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
