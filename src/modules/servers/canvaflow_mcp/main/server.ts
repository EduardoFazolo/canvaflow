/**
 * CanvaFlow MCP HTTP Bridge
 *
 * Runs in the Electron main process. The MCP server (spawned by Claude Code
 * as a stdio process) communicates with CanvaFlow through this bridge.
 *
 * Each endpoint validates the payload, then forwards it to the renderer via
 * IPC so the UI can react (e.g. display review comments in the diff view).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { app, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { CANVAFLOW_MCP_PORT } from '../shared/constants'
import type {
  AddKanbanTasksPayload,
  AddReviewCommentsPayload,
  BridgeResponse,
  ReplyToThreadPayload,
  ReviewMessage,
  ReviewSeverity,
  ReviewThread,
} from '../shared/types'

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: BridgeResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
  })
}

interface RawComment {
  file: string
  line: number
  severity: ReviewSeverity
  message: string
}

function isValidComment(c: unknown): c is RawComment {
  if (!c || typeof c !== 'object') return false
  const obj = c as Record<string, unknown>
  return (
    typeof obj.file === 'string' && obj.file.length > 0 &&
    typeof obj.line === 'number' && obj.line >= 1 &&
    typeof obj.severity === 'string' && ['critical', 'warning', 'nit'].includes(obj.severity) &&
    typeof obj.message === 'string' && obj.message.length > 0
  )
}

/**
 * Per-review thread counter so each new thread within the same review gets a
 * monotonically increasing index. Cleared when the renderer reports the review
 * was cleared (not yet wired — counters reset on app restart for now).
 */
const threadCounters = new Map<string, number>()

function nextThreadIndex(reviewId: string): number {
  const next = (threadCounters.get(reviewId) ?? 0)
  threadCounters.set(reviewId, next + 1)
  return next
}

function buildThreadId(reviewId: string, file: string, line: number): string {
  return `${reviewId}::${file}::${line}::${nextThreadIndex(reviewId)}`
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

type RouteHandler = (req: IncomingMessage, res: ServerResponse, wc: WebContents) => Promise<void>

const routes: Record<string, Record<string, RouteHandler>> = {
  POST: {
    /**
     * Create new review threads. Each input comment becomes a thread with one
     * initial message. Returns the generated thread IDs in input order so the
     * MCP tool caller can correlate (e.g. for follow-up replies).
     */
    '/review/comments': async (req, res, wc) => {
      const raw = await readBody(req)
      let payload: AddReviewCommentsPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON body' })
      }

      if (!payload.reviewId || typeof payload.reviewId !== 'string') {
        return json(res, 400, { ok: false, error: 'reviewId is required' })
      }
      if (!Array.isArray(payload.comments) || payload.comments.length === 0) {
        return json(res, 400, { ok: false, error: 'comments must be a non-empty array' })
      }

      const valid = payload.comments.filter(isValidComment)
      if (valid.length === 0) {
        return json(res, 400, { ok: false, error: 'No valid comments. Each needs: file (string), line (number >= 1), severity (critical|warning|nit), message (string)' })
      }

      const now = Date.now()
      const threads: ReviewThread[] = valid.map((c) => ({
        id: buildThreadId(payload.reviewId, c.file, c.line),
        file: c.file,
        line: c.line,
        messages: [{
          authorNodeId: payload.authorNodeId ?? null,
          authorName: payload.authorName ?? 'Claude',
          authorRole: 'reviewer',
          body: c.message,
          severity: c.severity,
          createdAt: now,
        }],
      }))

      wc.send('canvaflow-mcp:review-comments', payload.reviewId, threads)
      json(res, 200, { ok: true, count: threads.length, threadIds: threads.map((t) => t.id) })
    },

    /**
     * Append a message to an existing thread. Used by the
     * `reply_to_review_thread` MCP tool when an agent is responding to a
     * comment routed to it by the user.
     */
    '/review/reply': async (req, res, wc) => {
      const raw = await readBody(req)
      let payload: ReplyToThreadPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON body' })
      }

      if (!payload.threadId || typeof payload.threadId !== 'string') {
        return json(res, 400, { ok: false, error: 'threadId is required' })
      }
      if (!payload.body || typeof payload.body !== 'string') {
        return json(res, 400, { ok: false, error: 'body is required' })
      }

      const message: ReviewMessage = {
        authorNodeId: payload.authorNodeId ?? null,
        authorName: payload.authorName ?? 'Agent',
        authorRole: payload.authorRole ?? 'agent',
        body: payload.body,
        createdAt: Date.now(),
      }

      wc.send('canvaflow-mcp:review-reply', payload.threadId, message)
      json(res, 200, { ok: true })
    },

    /**
     * Batch-add kanban tasks to the current canvas's board. If no kanban node
     * is present on the active canvas, the renderer creates one. Duplicate
     * titles (anywhere in the active board) are skipped; existing cards are
     * never edited or removed. Fire-and-forget — the bridge returns as soon
     * as the IPC is dispatched; the renderer does the dedup.
     */
    '/kanban/add-tasks': async (req, res, wc) => {
      const raw = await readBody(req)
      let payload: AddKanbanTasksPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON body' })
      }

      if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
        return json(res, 400, { ok: false, error: 'tasks must be a non-empty array' })
      }

      const valid = payload.tasks.filter((t): t is { title: string; description?: string } => {
        if (!t || typeof t !== 'object') return false
        const obj = t as Record<string, unknown>
        if (typeof obj.title !== 'string' || obj.title.length === 0) return false
        if (obj.description !== undefined && typeof obj.description !== 'string') return false
        return true
      })

      if (valid.length === 0) {
        return json(res, 400, { ok: false, error: 'No valid tasks. Each needs: title (non-empty string), description (optional string)' })
      }

      wc.send('canvaflow-mcp:kanban-add-tasks', valid)
      json(res, 200, { ok: true, count: valid.length })
    },
  },

  GET: {
    '/health': async (_req, res) => {
      json(res, 200, { ok: true })
    },
  },
}

// ---------------------------------------------------------------------------
// MCP config injection — writes .claude/settings.json into a directory
// ---------------------------------------------------------------------------

/**
 * Ensure the CanvaFlow MCP server is configured in a directory's
 * .claude/settings.json. Merges with any existing config — we never overwrite
 * keys we don't own (e.g. other MCPs the user may have configured).
 *
 * Also performs an idempotent cleanup of any stale CanvaFlow SessionStart hook
 * entries from earlier versions of the app (we no longer use hooks). The old
 * config left a `bash .../mcps/canvaflow/hooks/session-start.sh` entry that now
 * points to a deleted script — claude prints "SessionStart:startup hook error"
 * on every startup if it's still there. This block self-heals worktrees on
 * the next claude spawn.
 *
 * Exported so other main-process code (e.g. the PTY spawner) can call it
 * directly without going through IPC.
 */
export function injectMcpConfig(targetDir: string): void {
  const mcpIndexPath = join(app.getAppPath(), 'mcps/canvaflow/index.ts')
  const claudeDir = join(targetDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  mkdirSync(claudeDir, { recursive: true })

  let cfg: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try { cfg = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { /* start fresh */ }
  }

  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
    cfg.mcpServers = {}
  }
  (cfg.mcpServers as Record<string, unknown>).canvaflow = {
    command: 'bun',
    args: ['run', mcpIndexPath],
  }

  // --- Cleanup: remove any stale canvaflow SessionStart hook entries
  if (cfg.hooks && typeof cfg.hooks === 'object') {
    const hooks = cfg.hooks as Record<string, unknown>
    if (Array.isArray(hooks.SessionStart)) {
      const cleaned = (hooks.SessionStart as unknown[]).filter((entry) => {
        if (!entry || typeof entry !== 'object') return true
        const innerHooks = (entry as Record<string, unknown>).hooks
        if (!Array.isArray(innerHooks)) return true
        // Drop the entry if any of its hooks reference our old session-start.sh
        return !innerHooks.some((h) => {
          if (!h || typeof h !== 'object') return false
          const cmd = (h as Record<string, unknown>).command
          return typeof cmd === 'string' && cmd.includes('mcps/canvaflow/hooks/session-start.sh')
        })
      })
      if (cleaned.length === 0) {
        delete hooks.SessionStart
      } else {
        hooks.SessionStart = cleaned
      }
      // If hooks ended up empty, remove the key entirely
      if (Object.keys(hooks).length === 0) {
        delete cfg.hooks
      }
    }
  }

  writeFileSync(settingsPath, JSON.stringify(cfg, null, 2))
}

function registerMcpIpcHandlers(): void {
  ipcMain.handle('canvaflow-mcp:inject-config', (_e, targetDir: string) => {
    injectMcpConfig(targetDir)
  })
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function startCanvaflowMcpBridge(getWebContents: () => WebContents | null): void {
  registerMcpIpcHandlers()
  const server = createServer(async (req, res) => {
    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const method = req.method ?? 'GET'
    const url = req.url ?? '/'
    const handler = routes[method]?.[url]

    if (!handler) {
      return json(res, 404, { ok: false, error: `Unknown route: ${method} ${url}` })
    }

    const wc = getWebContents()
    if (!wc || wc.isDestroyed()) {
      return json(res, 503, { ok: false, error: 'CanvaFlow window not available' })
    }

    try {
      await handler(req, res, wc)
    } catch (err) {
      console.error('[canvaflow-mcp] handler error:', err)
      json(res, 500, { ok: false, error: 'Internal server error' })
    }
  })

  server.listen(CANVAFLOW_MCP_PORT, '127.0.0.1', () => {
    console.log(`[canvaflow-mcp] bridge ready at http://127.0.0.1:${CANVAFLOW_MCP_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[canvaflow-mcp] port ${CANVAFLOW_MCP_PORT} already in use — bridge skipped`)
    } else {
      console.error('[canvaflow-mcp] bridge error:', err)
    }
  })
}
