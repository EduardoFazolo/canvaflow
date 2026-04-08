// ---------------------------------------------------------------------------
// CanvaFlow MCP — shared types between main process, renderer, and MCP server
// ---------------------------------------------------------------------------

export type ReviewSeverity = 'critical' | 'warning' | 'nit'

/**
 * A single message inside a review thread. The first message in a thread is
 * always the original review finding (and carries the severity). Subsequent
 * messages are replies — from the user, the same reviewer, or any other
 * agent the user routes the thread to.
 */
export interface ReviewMessage {
  /** Author identity. null = the human user. */
  authorNodeId: string | null
  /** Display name shown in the message header (e.g. "You", "Claude (main)") */
  authorName: string
  /** Author kind — drives the avatar / accent color */
  authorRole: 'user' | 'main' | 'reviewer' | 'agent'
  /** Markdown body */
  body: string
  /** ms epoch */
  createdAt: number
  /** Only set on the first message of a thread (the original review classification) */
  severity?: ReviewSeverity
}

/**
 * A review thread is anchored to a specific file + line. It starts as a
 * single review finding from the reviewer agent and grows as the user and
 * other agents reply. Every message in the thread shares the same anchor.
 */
export interface ReviewThread {
  /** Globally unique within a review. Format: <reviewId>::<file>::<line>::<n> */
  id: string
  /** Relative file path (matches the diff view's file path) */
  file: string
  /** 1-based line number in the modified file */
  line: number
  messages: ReviewMessage[]
}

// ---------------------------------------------------------------------------
// Bridge payloads
// ---------------------------------------------------------------------------

/**
 * Request body for POST /review/comments — used by the reviewer agent's
 * `add_review_comment` / `batch_review_comments` MCP tools to create new
 * threads.
 */
export interface AddReviewCommentsPayload {
  reviewId: string
  /** Node id of the reviewer agent creating these comments, captured from
   *  the MCP server's CANVAFLOW_NODE_ID env var. Used so the initial thread
   *  message is clickable and jumps to the reviewer on the canvas. */
  authorNodeId?: string | null
  authorName?: string
  comments: Array<{
    file: string
    line: number
    severity: ReviewSeverity
    message: string
  }>
}

/**
 * Request body for POST /review/reply — used by `reply_to_review_thread`
 * to append a message to an existing thread.
 */
export interface ReplyToThreadPayload {
  threadId: string
  authorNodeId?: string | null
  authorName?: string
  authorRole?: 'user' | 'main' | 'reviewer' | 'agent'
  body: string
}

/**
 * Request body for POST /kanban/add-tasks — used by the `add_kanban_tasks`
 * MCP tool to batch-append cards to the current canvas's kanban board. The
 * bridge targets whichever canvas is currently active in the renderer; the
 * caller does not pick a canvas or board explicitly.
 */
export interface AddKanbanTasksPayload {
  tasks: Array<{
    title: string
    description?: string
  }>
}

/** Generic success/error response from the HTTP bridge. */
export interface BridgeResponse {
  ok: boolean
  error?: string
  /** Number of comments/replies accepted */
  count?: number
  /** Returned by /review/comments — IDs of newly created threads (in input order) */
  threadIds?: string[]
}
