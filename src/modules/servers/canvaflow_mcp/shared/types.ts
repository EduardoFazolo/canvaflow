// ---------------------------------------------------------------------------
// CanvaFlow MCP — shared types between main process, renderer, and MCP server
// ---------------------------------------------------------------------------

/** A review comment attached to a specific file and line in a code review. */
export interface ReviewComment {
  /** Relative file path within the repo */
  file: string
  /** Line number in the modified file (1-based) */
  line: number
  /** Severity of the finding */
  severity: 'critical' | 'warning' | 'nit'
  /** The review comment body */
  message: string
}

/** Payload sent to the HTTP bridge for batching review comments. */
export interface AddReviewCommentsPayload {
  /** The review view ID this comment belongs to (e.g. "review-<cardId>") */
  reviewId: string
  /** One or more review comments to add */
  comments: ReviewComment[]
}

/** Generic success/error response from the HTTP bridge. */
export interface BridgeResponse {
  ok: boolean
  error?: string
  /** Number of comments accepted */
  count?: number
}
