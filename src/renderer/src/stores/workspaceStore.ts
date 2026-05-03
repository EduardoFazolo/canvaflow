import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface Workspace {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
  description: string | null
  archived?: boolean
  sortOrder?: number
}

export interface NodeSummary {
  id: string
  title: string
  type: string
  subtitle?: string   // e.g. URL for browser nodes
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeId: string | null
  nodeSummaries: Record<string, NodeSummary[]>

  // Actions
  setWorkspaces: (ws: Workspace[]) => void
  setActive: (id: string) => void
  addWorkspace: (name: string, path: string, color?: string) => Workspace
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  touchWorkspace: (id: string) => void
  archiveWorkspace: (id: string, archived: boolean) => void
  reorderWorkspaces: (orderedIds: string[]) => void
  setNodeSummaries: (workspaceId: string, nodes: NodeSummary[]) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  nodeSummaries: {},

  setWorkspaces: (ws) => set({ workspaces: ws }),

  setActive: (id) => set({ activeId: id }),

  addWorkspace: (name, path, color = null as unknown as string) => {
    const ws: Workspace = {
      id: nanoid(),
      name,
      path,
      lastOpenedAt: Date.now(),
      color: color ?? null,
      description: null,
    }
    set((s) => ({ workspaces: [...s.workspaces, ws] }))
    return ws
  },

  removeWorkspace: (id) =>
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeId: s.activeId === id
        ? (s.workspaces.find((w) => w.id !== id)?.id ?? null)
        : s.activeId,
    })),

  renameWorkspace: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    })),

  touchWorkspace: (id) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, lastOpenedAt: Date.now() } : w
      ),
    })),

  archiveWorkspace: (id, archived) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, archived } : w)),
    })),

  reorderWorkspaces: (orderedIds) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => {
        const idx = orderedIds.indexOf(w.id)
        return idx >= 0 ? { ...w, sortOrder: idx } : w
      }),
    })),

  setNodeSummaries: (workspaceId, nodes) =>
    set((s) => ({
      nodeSummaries: { ...s.nodeSummaries, [workspaceId]: nodes },
    })),
}))

// Resolve active workspace object
export const getActiveWorkspace = (): Workspace | null => {
  const { workspaces, activeId } = useWorkspaceStore.getState()
  return workspaces.find((w) => w.id === activeId) ?? null
}
