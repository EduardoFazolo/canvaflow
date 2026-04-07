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
import type { AddReviewCommentsPayload, BridgeResponse, ReviewComment } from '../shared/types'
import { upsertNodeMetadata } from '../../../../main/database'

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

function isValidComment(c: unknown): c is ReviewComment {
  if (!c || typeof c !== 'object') return false
  const obj = c as Record<string, unknown>
  return (
    typeof obj.file === 'string' && obj.file.length > 0 &&
    typeof obj.line === 'number' && obj.line >= 1 &&
    typeof obj.severity === 'string' && ['critical', 'warning', 'nit'].includes(obj.severity) &&
    typeof obj.message === 'string' && obj.message.length > 0
  )
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

type RouteHandler = (req: IncomingMessage, res: ServerResponse, wc: WebContents) => Promise<void>

const routes: Record<string, Record<string, RouteHandler>> = {
  POST: {
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

      wc.send('canvaflow-mcp:review-comments', payload.reviewId, valid)
      json(res, 200, { ok: true, count: valid.length })
    },

    /**
     * Called by the SessionStart hook script every time a Claude session
     * begins. Persists the mapping nodeId → sessionId so the agent can be
     * resumed on app restart.
     */
    '/agent/session': async (req, res, wc) => {
      const raw = await readBody(req)
      let payload: { nodeId?: unknown; sessionId?: unknown }
      try {
        payload = JSON.parse(raw)
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON body' })
      }

      const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : ''
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
      if (!nodeId || !sessionId) {
        return json(res, 400, { ok: false, error: 'nodeId and sessionId are required' })
      }

      try {
        upsertNodeMetadata(nodeId, { agentSessionId: sessionId })
      } catch (e) {
        console.error('[canvaflow-mcp] failed to persist agent session:', e)
        return json(res, 500, { ok: false, error: 'Failed to persist session' })
      }

      // Notify the renderer in case anything is listening (no-op consumer for now,
      // but useful for future "agent session updated" UI)
      wc.send('canvaflow-mcp:agent-session', { nodeId, sessionId })
      json(res, 200, { ok: true })
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
 * Ensure the CanvaFlow MCP server AND the SessionStart hook are configured
 * in a directory's .claude/settings.json. Both pieces are merged with any
 * existing config — we never overwrite keys we don't own (e.g. other MCPs
 * the user may have configured).
 */
function injectMcpConfig(targetDir: string): void {
  const mcpIndexPath = join(app.getAppPath(), 'mcps/canvaflow/index.ts')
  const hookScriptPath = join(app.getAppPath(), 'mcps/canvaflow/hooks/session-start.sh')
  const claudeDir = join(targetDir, '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  mkdirSync(claudeDir, { recursive: true })

  let cfg: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try { cfg = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { /* start fresh */ }
  }

  // --- mcpServers.canvaflow
  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
    cfg.mcpServers = {}
  }
  (cfg.mcpServers as Record<string, unknown>).canvaflow = {
    command: 'bun',
    args: ['run', mcpIndexPath],
  }

  // --- hooks.SessionStart — append our hook entry, preserve any existing ones
  if (!cfg.hooks || typeof cfg.hooks !== 'object') {
    cfg.hooks = {}
  }
  const hooks = cfg.hooks as Record<string, unknown>
  const existingSessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart as unknown[] : []
  // Filter out any previous canvaflow hook so we don't accumulate duplicates
  // when injectMcpConfig is called multiple times for the same dir.
  const filtered = existingSessionStart.filter((entry) => {
    if (!entry || typeof entry !== 'object') return true
    const e = entry as Record<string, unknown>
    const innerHooks = Array.isArray(e.hooks) ? e.hooks as unknown[] : []
    return !innerHooks.some((h) => {
      if (!h || typeof h !== 'object') return false
      const cmd = (h as Record<string, unknown>).command
      return typeof cmd === 'string' && cmd.includes('mcps/canvaflow/hooks/session-start.sh')
    })
  })
  hooks.SessionStart = [
    ...filtered,
    {
      matcher: '*',
      hooks: [{
        type: 'command',
        command: `bash ${JSON.stringify(hookScriptPath).slice(1, -1)}`,
      }],
    },
  ]

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
