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
 * Ensure the CanvaFlow MCP is configured in a directory's .claude/settings.json.
 * Merges with any existing config (e.g. if Lovable MCP is already there).
 */
function injectMcpConfig(targetDir: string): void {
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
