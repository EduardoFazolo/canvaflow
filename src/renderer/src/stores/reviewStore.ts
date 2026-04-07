import { create } from 'zustand'
import type { ReviewComment } from '../../../modules/servers/canvaflow_mcp/shared/types'

// ---------------------------------------------------------------------------
// Persistence — debounced save to appState
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'review_comments'
let saveTimer: ReturnType<typeof setTimeout> | null = null

function persist(comments: Record<string, ReviewComment[]>): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.appState.set(STORAGE_KEY, JSON.stringify(comments))
  }, 400)
}

// ---------------------------------------------------------------------------
// IPC listener + persisted-state loader — call once at app startup
// ---------------------------------------------------------------------------

let ipcInitialized = false

export function initReviewIpc(): void {
  if (ipcInitialized) return
  ipcInitialized = true

  // Load persisted comments
  window.appState.get(STORAGE_KEY).then((raw) => {
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Record<string, ReviewComment[]>
      useReviewStore.setState({ comments: parsed })
    } catch { /* ignore corrupt state */ }
  })

  // Listen for new comments from the MCP bridge
  window.canvaflowMcp.onReviewComments((reviewId, comments) => {
    useReviewStore.getState().addComments(reviewId, comments as ReviewComment[])
  })
}

interface ReviewStore {
  /** reviewId → list of comments */
  comments: Record<string, ReviewComment[]>
  /** Add comments for a review (appends, does not replace) */
  addComments: (reviewId: string, comments: ReviewComment[]) => void
  /** Get comments for a specific review */
  getComments: (reviewId: string) => ReviewComment[]
  /** Get comments for a specific file within a review */
  getFileComments: (reviewId: string, file: string) => ReviewComment[]
  /** Clear all comments for a review */
  clearReview: (reviewId: string) => void
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  comments: {},

  addComments: (reviewId, newComments) => {
    set((s) => {
      const next = {
        ...s.comments,
        [reviewId]: [...(s.comments[reviewId] ?? []), ...newComments],
      }
      persist(next)
      return { comments: next }
    })
  },

  getComments: (reviewId) => get().comments[reviewId] ?? [],

  getFileComments: (reviewId, file) =>
    (get().comments[reviewId] ?? []).filter((c) => c.file === file),

  clearReview: (reviewId) => {
    set((s) => {
      const comments = { ...s.comments }
      delete comments[reviewId]
      persist(comments)
      return { comments }
    })
  },
}))
