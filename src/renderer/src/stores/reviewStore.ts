import { create } from 'zustand'
import type {
  ReviewThread,
  ReviewMessage,
  ReviewSeverity,
} from '../../../modules/servers/canvaflow_mcp/shared/types'

// ---------------------------------------------------------------------------
// Persistence — debounced save to appState
// ---------------------------------------------------------------------------

const STORAGE_KEY_THREADS = 'review_threads_v2'
const STORAGE_KEY_LEGACY = 'review_comments' // pre-v2 single-author shape
const STORAGE_KEY_SELECTED = 'review_selected_agent'

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persistThreads(threads: Record<string, ReviewThread[]>): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.appState.set(STORAGE_KEY_THREADS, JSON.stringify(threads))
  }, 400)
}

let selectedSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistSelectedAgent(selected: Record<string, string>): void {
  if (selectedSaveTimer) clearTimeout(selectedSaveTimer)
  selectedSaveTimer = setTimeout(() => {
    window.appState.set(STORAGE_KEY_SELECTED, JSON.stringify(selected))
  }, 400)
}

// ---------------------------------------------------------------------------
// Legacy migration: convert old flat ReviewComment[] into single-message threads
// ---------------------------------------------------------------------------

interface LegacyReviewComment {
  file: string
  line: number
  severity: ReviewSeverity
  message: string
}

function migrateLegacyComments(
  legacy: Record<string, LegacyReviewComment[]>,
): Record<string, ReviewThread[]> {
  const out: Record<string, ReviewThread[]> = {}
  for (const [reviewId, comments] of Object.entries(legacy)) {
    out[reviewId] = comments.map((c, i): ReviewThread => ({
      id: `${reviewId}::${c.file}::${c.line}::${i}`,
      file: c.file,
      line: c.line,
      messages: [{
        authorNodeId: null,
        authorName: 'Claude',
        authorRole: 'reviewer',
        body: c.message,
        severity: c.severity,
        createdAt: Date.now(),
      }],
    }))
  }
  return out
}

// ---------------------------------------------------------------------------
// IPC listener + persisted-state loader — call once at app startup
// ---------------------------------------------------------------------------

let ipcInitialized = false

export function initReviewIpc(): void {
  if (ipcInitialized) return
  ipcInitialized = true

  // Load persisted threads (preferring the v2 shape, falling back to legacy)
  ;(async () => {
    const v2 = await window.appState.get(STORAGE_KEY_THREADS)
    if (v2) {
      try {
        const parsed = JSON.parse(v2) as Record<string, ReviewThread[]>
        useReviewStore.setState({ threads: parsed })
      } catch { /* ignore corrupt state */ }
    } else {
      const legacy = await window.appState.get(STORAGE_KEY_LEGACY)
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy) as Record<string, LegacyReviewComment[]>
          const migrated = migrateLegacyComments(parsed)
          useReviewStore.setState({ threads: migrated })
          persistThreads(migrated) // save in v2 shape going forward
        } catch { /* ignore corrupt state */ }
      }
    }

    // Load selected-agent map
    const sel = await window.appState.get(STORAGE_KEY_SELECTED)
    if (sel) {
      try {
        useReviewStore.setState({ selectedAgent: JSON.parse(sel) })
      } catch { /* ignore */ }
    }
  })()

  // Listen for new threads / replies from the MCP bridge
  window.canvaflowMcp?.onReviewComments((reviewId, threads) => {
    useReviewStore.getState().addThreads(reviewId, threads as ReviewThread[])
  })
  window.canvaflowMcp?.onReviewReply((threadId, message) => {
    useReviewStore.getState().appendMessage(threadId, message as ReviewMessage)
  })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ReviewStore {
  /** reviewId → list of threads */
  threads: Record<string, ReviewThread[]>
  /** reviewId → last selected agent nodeId for the agent picker */
  selectedAgent: Record<string, string>

  /** Add new threads to a review (appends, does not replace) */
  addThreads: (reviewId: string, threads: ReviewThread[]) => void
  /** Append a message to an existing thread (matched by thread.id) */
  appendMessage: (threadId: string, message: ReviewMessage) => void
  /** Set the selected agent for a review */
  setSelectedAgent: (reviewId: string, nodeId: string) => void

  /** Look up the review ID a given thread belongs to */
  findReviewIdForThread: (threadId: string) => string | null

  /** Get all threads for a review */
  getThreads: (reviewId: string) => ReviewThread[]
  /** Get threads filtered to a specific file */
  getFileThreads: (reviewId: string, file: string) => ReviewThread[]
  /** Clear all threads for a review */
  clearReview: (reviewId: string) => void
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  threads: {},
  selectedAgent: {},

  addThreads: (reviewId, newThreads) => {
    set((s) => {
      const next = {
        ...s.threads,
        [reviewId]: [...(s.threads[reviewId] ?? []), ...newThreads],
      }
      persistThreads(next)
      return { threads: next }
    })
  },

  appendMessage: (threadId, message) => {
    set((s) => {
      // Find the review that owns this thread
      let foundReviewId: string | null = null
      let foundThreadIdx = -1
      for (const [reviewId, threads] of Object.entries(s.threads)) {
        const idx = threads.findIndex((t) => t.id === threadId)
        if (idx !== -1) { foundReviewId = reviewId; foundThreadIdx = idx; break }
      }
      if (!foundReviewId) return s

      const updatedThreads = s.threads[foundReviewId].map((t, i) =>
        i === foundThreadIdx
          ? { ...t, messages: [...t.messages, message] }
          : t
      )
      const next = { ...s.threads, [foundReviewId]: updatedThreads }
      persistThreads(next)
      return { threads: next }
    })
  },

  setSelectedAgent: (reviewId, nodeId) => {
    set((s) => {
      const next = { ...s.selectedAgent, [reviewId]: nodeId }
      persistSelectedAgent(next)
      return { selectedAgent: next }
    })
  },

  findReviewIdForThread: (threadId) => {
    for (const [reviewId, threads] of Object.entries(get().threads)) {
      if (threads.some((t) => t.id === threadId)) return reviewId
    }
    return null
  },

  getThreads: (reviewId) => get().threads[reviewId] ?? [],

  getFileThreads: (reviewId, file) =>
    (get().threads[reviewId] ?? []).filter((t) => t.file === file),

  clearReview: (reviewId) => {
    set((s) => {
      const threads = { ...s.threads }
      delete threads[reviewId]
      persistThreads(threads)
      return { threads }
    })
  },
}))
