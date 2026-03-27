import { create } from 'zustand'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KanbanCard {
  id: string
  title: string
  description?: string
  /** Rich content stored as TipTap JSON for markdown + images */
  content?: object
}

export interface KanbanColumn {
  id: string
  title: string
  color: string
  cards: KanbanCard[]
}

export interface KanbanBoard {
  id: string
  name: string
  columns: KanbanColumn[]
}

export interface KanbanState {
  boards: KanbanBoard[]
  activeBoardId: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = ['#868e96', '#1c7ed6', '#f08c00', '#2f9e44']

export function createDefaultBoard(): KanbanBoard {
  return {
    id: nanoid(8),
    name: 'Board 1',
    columns: [
      { id: nanoid(8), title: 'BACKLOG', color: DEFAULT_COLORS[0], cards: [] },
      { id: nanoid(8), title: 'IN PROGRESS', color: DEFAULT_COLORS[1], cards: [] },
      { id: nanoid(8), title: 'REVIEW', color: DEFAULT_COLORS[2], cards: [] },
      { id: nanoid(8), title: 'DONE', color: DEFAULT_COLORS[3], cards: [] },
    ],
  }
}

function createDefaultState(): KanbanState {
  const board = createDefaultBoard()
  return { boards: [board], activeBoardId: board.id }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Maps branchName → list of conflicting file paths */
export type ConflictMap = Record<string, string[]>

interface KanbanStore {
  state: KanbanState
  workspaceId: string
  loaded: boolean
  conflicts: ConflictMap
  load: (workspaceId: string) => Promise<void>
  setState: (next: KanbanState) => void
  setConflicts: (conflicts: ConflictMap) => void
}

/** Debounced save handle */
let saveTimer: ReturnType<typeof setTimeout> | null = null

function persistToAppState(workspaceId: string, data: KanbanState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.appState.set(`kanban_${workspaceId}`, JSON.stringify(data))
  }, 400)
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  state: createDefaultState(),
  workspaceId: '',
  loaded: false,
  conflicts: {},

  load: async (workspaceId: string) => {
    // Don't reload if already loaded for this workspace
    if (get().loaded && get().workspaceId === workspaceId) return

    const raw = await window.appState.get(`kanban_${workspaceId}`)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as KanbanState
        set({ state: parsed, workspaceId, loaded: true })
        return
      } catch { /* fall through to default */ }
    }
    set({ state: createDefaultState(), workspaceId, loaded: true })
  },

  setState: (next: KanbanState) => {
    set({ state: next })
    const { workspaceId } = get()
    if (workspaceId) persistToAppState(workspaceId, next)
  },

  setConflicts: (conflicts: ConflictMap) => {
    set({ conflicts })
  },
}))
