import { create } from 'zustand'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

let viewSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistViews(instances: ViewInstance[]): void {
  if (viewSaveTimer) clearTimeout(viewSaveTimer)
  viewSaveTimer = setTimeout(() => {
    // Persist worktree canvases AND code-review tabs (anything tied to a worktree)
    const persistable = instances.filter((i) => i.worktreePath || i.type === 'code-review')
    window.appState.set('worktree_views', JSON.stringify(persistable))
  }, 400)
}

let closedViewSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistClosedViews(closedViews: ViewInstance[]): void {
  if (closedViewSaveTimer) clearTimeout(closedViewSaveTimer)
  closedViewSaveTimer = setTimeout(() => {
    window.appState.set('closed_worktree_views', JSON.stringify(closedViews))
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
  /** The parent VIEW this tab is attached to (e.g. a code-review tab is a child of its branch canvas tab) */
  parentViewId?: string
}

interface ViewStore {
  instances: ViewInstance[]
  closedViews: ViewInstance[]
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
  reopenClosedView: (viewId: string) => void
  updateAgentStatus: (viewId: string, status: AgentStatus, agentNodeId?: string) => void
  getViewByNodeId: (nodeId: string) => ViewInstance | undefined
  getViewByCardId: (cardId: string) => ViewInstance | undefined
  getClosedViewByCardId: (cardId: string) => ViewInstance | undefined
  loadPersistedViews: () => Promise<void>
}

export const useViewStore = create<ViewStore>((set, get) => ({
  instances: [
    { id: 'canvas', type: 'canvas', label: 'Canvas', closeable: false },
  ],
  closedViews: [],
  activeId: 'canvas',

  activate: (id) => {
    if (get().instances.find((i) => i.id === id)) set({ activeId: id })
  },

  open: (instance) => {
    if (get().instances.find((i) => i.id === instance.id)) {
      set({ activeId: instance.id })
      return
    }
    set((s) => {
      const newInstances = [...s.instances, instance]
      // Persist if this view should survive restarts
      if (instance.worktreePath || instance.type === 'code-review') {
        persistViews(newInstances)
      }
      return { instances: newInstances, activeId: instance.id }
    })
  },

  close: (id) => {
    const { instances, activeId, closedViews } = get()
    const inst = instances.find((i) => i.id === id)
    if (!inst?.closeable) return
    const remaining = instances.filter((i) => i.id !== id)
    const idx = instances.findIndex((i) => i.id === id)
    const newActiveId = activeId === id
      ? (remaining[Math.max(0, idx - 1)]?.id ?? 'canvas')
      : activeId
    persistViews(remaining)

    // Track closed worktree CANVAS views so they can be reopened from the kanban board
    // (code-review views are recreated on demand, not tracked separately)
    if (inst.type === 'canvas' && inst.worktreePath && inst.sourceCardId) {
      const alreadyClosed = closedViews.some((v) => v.id === inst.id)
      if (!alreadyClosed) {
        const updated = [...closedViews, { ...inst, agentStatus: 'idle' as AgentStatus, agentNodeId: undefined }]
        persistClosedViews(updated)
        set({ instances: remaining, activeId: newActiveId, closedViews: updated })
        return
      }
    }

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

  reopenClosedView: (viewId) => {
    const { closedViews, instances } = get()
    const view = closedViews.find((v) => v.id === viewId)
    if (!view) return
    // Already open?
    if (instances.find((i) => i.id === viewId)) {
      set({ activeId: viewId })
      return
    }
    const restored: ViewInstance = {
      ...view,
      agentStatus: 'idle' as AgentStatus,
      agentNodeId: undefined,
    }
    const updatedClosed = closedViews.filter((v) => v.id !== viewId)
    persistClosedViews(updatedClosed)
    const newInstances = [...instances, restored]
    persistViews(newInstances)
    set({ instances: newInstances, activeId: viewId, closedViews: updatedClosed })
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

  getClosedViewByCardId: (cardId) => {
    return get().closedViews.find((i) => i.sourceCardId === cardId)
  },

  loadPersistedViews: async () => {
    try {
      const raw = await window.appState.get('worktree_views')
      if (raw) {
        const views = JSON.parse(raw) as ViewInstance[]
        // Pass 1: restore agent state + migrate legacy code-review tabs that
        // were saved without `parentWorkspaceId`. Inherit from their parent
        // canvas view when available so they get scoped to the right workspace.
        const byId = new Map(views.map((v) => [v.id, v]))
        const restored = views.map((v) => {
          if (v.type === 'code-review') {
            if (!v.parentWorkspaceId && v.parentViewId) {
              const parent = byId.get(v.parentViewId)
              if (parent?.parentWorkspaceId) {
                return { ...v, parentWorkspaceId: parent.parentWorkspaceId }
              }
            }
            return v
          }
          return { ...v, agentStatus: 'idle' as AgentStatus, agentNodeId: undefined }
        })
        if (restored.length > 0) {
          set((s) => ({ instances: [...s.instances, ...restored] }))
        }
      }
    } catch {}
    // Also load closed worktree views
    try {
      const raw = await window.appState.get('closed_worktree_views')
      if (raw) {
        const closed = JSON.parse(raw) as ViewInstance[]
        if (closed.length > 0) {
          set({ closedViews: closed })
        }
      }
    } catch {}
  },
}))
