import { create } from 'zustand'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

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
  }) => string
  updateAgentStatus: (viewId: string, status: AgentStatus, agentNodeId?: string) => void
  getViewByNodeId: (nodeId: string) => ViewInstance | undefined
  getViewByCardId: (cardId: string) => ViewInstance | undefined
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
    set({ instances: remaining, activeId: newActiveId })
  },

  createWorktreeView: ({ worktreePath, branchName, sourceCardId }) => {
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
    }
    set((s) => ({ instances: [...s.instances, instance], activeId: viewId }))
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
}))
