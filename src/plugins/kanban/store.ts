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
  /** Add a card to the first column of the active board. Returns the new card, or null if no board is loaded. */
  addCardToFirstColumn: (card: Omit<KanbanCard, 'id'>) => KanbanCard | null
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

  addCardToFirstColumn: (cardData: Omit<KanbanCard, 'id'>) => {
    const { state, workspaceId } = get()
    const board = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]
    if (!board || board.columns.length === 0) return null

    const newCard: KanbanCard = { id: nanoid(8), ...cardData }
    const firstCol = board.columns[0]
    const newColumns = board.columns.map((c) =>
      c.id === firstCol.id ? { ...c, cards: [...c.cards, newCard] } : c,
    )
    const next: KanbanState = {
      ...state,
      boards: state.boards.map((b) => (b.id === board.id ? { ...b, columns: newColumns } : b)),
    }
    set({ state: next })
    if (workspaceId) persistToAppState(workspaceId, next)
    return newCard
  },
}))
