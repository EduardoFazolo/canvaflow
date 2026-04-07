import { create } from 'zustand'
import type { ReviewComment } from '../../../modules/servers/canvaflow_mcp/shared/types'

// ---------------------------------------------------------------------------
// IPC listener — call once at app startup to pipe bridge events into the store
// ---------------------------------------------------------------------------

let ipcInitialized = false

export function initReviewIpc(): void {
  if (ipcInitialized) return
  ipcInitialized = true

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
    set((s) => ({
      comments: {
        ...s.comments,
        [reviewId]: [...(s.comments[reviewId] ?? []), ...newComments],
      },
    }))
  },

  getComments: (reviewId) => get().comments[reviewId] ?? [],

  getFileComments: (reviewId, file) =>
    (get().comments[reviewId] ?? []).filter((c) => c.file === file),

  clearReview: (reviewId) => {
    set((s) => {
      const comments = { ...s.comments }
      delete comments[reviewId]
      return { comments }
    })
  },
}))
