import { create } from 'zustand'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

let viewSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistViews(instances: ViewInstance[]): void {
  if (viewSaveTimer) clearTimeout(viewSaveTimer)
  viewSaveTimer = setTimeout(() => {
    const worktreeViews = instances.filter((i) => i.worktreePath)
    window.appState.set('worktree_views', JSON.stringify(worktreeViews))
  }, 400)
}

export interface ViewInstance {
  id: string
  type: string
  label: string
  closeable: boolean
  // Worktree canvas fields
  worktreePath?: string
  branchName?: string
  sourceCardId?: string
  agentStatus?: AgentStatus
  agentNodeId?: string
  /** The workspace this view belongs to (worktree tabs only show in their parent workspace) */
  parentWorkspaceId?: string
}

interface ViewStore {
  instances: ViewInstance[]
  activeId: string
  activate: (id: string) => void
  open: (instance: ViewInstance) => void
  close: (id: string) => void
  createWorktreeView: (params: {
    worktreePath: string
    branchName: string
    sourceCardId: string
    parentWorkspaceId: string
  }) => string
  updateAgentStatus: (viewId: string, status: AgentStatus, agentNodeId?: string) => void
  getViewByNodeId: (nodeId: string) => ViewInstance | undefined
  getViewByCardId: (cardId: string) => ViewInstance | undefined
  loadPersistedViews: () => Promise<void>
}

export const useViewStore = create<ViewStore>((set, get) => ({
  instances: [
    { id: 'canvas', type: 'canvas', label: 'Canvas', closeable: false },
  ],
  activeId: 'canvas',

  activate: (id) => {
    if (get().instances.find((i) => i.id === id)) set({ activeId: id })
  },

  open: (instance) => {
    if (get().instances.find((i) => i.id === instance.id)) {
      set({ activeId: instance.id })
      return
    }
    set((s) => ({ instances: [...s.instances, instance], activeId: instance.id }))
  },

  close: (id) => {
    const { instances, activeId } = get()
    const inst = instances.find((i) => i.id === id)
    if (!inst?.closeable) return
    const remaining = instances.filter((i) => i.id !== id)
    const idx = instances.findIndex((i) => i.id === id)
    const newActiveId = activeId === id
      ? (remaining[Math.max(0, idx - 1)]?.id ?? 'canvas')
      : activeId
    persistViews(remaining)
    set({ instances: remaining, activeId: newActiveId })
  },

  createWorktreeView: ({ worktreePath, branchName, sourceCardId, parentWorkspaceId }) => {
    const viewId = `wt-${branchName}-${Date.now()}`
    const instance: ViewInstance = {
      id: viewId,
      type: 'canvas',
      label: branchName,
      closeable: true,
      worktreePath,
      branchName,
      sourceCardId,
      agentStatus: 'idle',
      parentWorkspaceId,
    }
    set((s) => {
      const newInstances = [...s.instances, instance]
      persistViews(newInstances)
      return { instances: newInstances, activeId: viewId }
    })
    return viewId
  },

  updateAgentStatus: (viewId, status, agentNodeId) => {
    set((s) => ({
      instances: s.instances.map((inst) =>
        inst.id === viewId
          ? { ...inst, agentStatus: status, ...(agentNodeId ? { agentNodeId } : {}) }
          : inst,
      ),
    }))
  },

  getViewByNodeId: (nodeId) => {
    return get().instances.find((i) => i.agentNodeId === nodeId)
  },

  getViewByCardId: (cardId) => {
    return get().instances.find((i) => i.sourceCardId === cardId)
  },

  loadPersistedViews: async () => {
    try {
      const raw = await window.appState.get('worktree_views')
      if (!raw) return
      const views = JSON.parse(raw) as ViewInstance[]
      // Restore worktree views with idle agent status (agent not running after restart)
      const restored = views.map((v) => ({
        ...v,
        agentStatus: 'idle' as AgentStatus,
        agentNodeId: undefined,
      }))
      if (restored.length > 0) {
        set((s) => ({ instances: [...s.instances, ...restored] }))
      }
    } catch {}
  },
}))
