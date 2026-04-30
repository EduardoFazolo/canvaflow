import { app, BrowserWindow } from 'electron'
import { createServer } from 'http'
import { join } from 'path'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { executeBrowserViewJS } from '../../../main/browserViewManager'
import type { IpcMainLike } from '../../types'

const HTTP_PORT = 47823

interface NodeStatus {
  loggedIn: boolean
  url: string
  lastSeen: number
}

const nodeStatus = new Map<string, NodeStatus>()

// ---------------------------------------------------------------------------
// CLAUDE.md content injected into the companion agent's session directory
// ---------------------------------------------------------------------------

const CLAUDE_MD = `# Lovable Companion

You are a Lovable AI companion running inside CanvaFlow. The user has a Lovable project open in the browser next to you.

## Your role

Help the user build their web app by sending prompts to Lovable. You do NOT write or edit local files — Lovable's AI handles all the code.

## How to send prompts to Lovable

Use the \`send_to_lovable\` MCP tool:

\`\`\`
send_to_lovable(prompt: "Your prompt here")
\`\`\`

Keep prompts clear, specific, and actionable. One focused change per prompt works better than multiple things at once.

## How to check status

Use \`get_lovable_status()\` to verify Lovable is open and logged in before sending.

## What NOT to do

- Do not run Bash commands to explore or modify local files
- Do not read or write code files — Lovable owns the codebase
- Do not try to run the project locally

## Workflow

1. Understand what the user wants to build or change
2. Craft a clear prompt describing the desired behavior
3. Use \`send_to_lovable\` to send it
4. Tell the user what you sent and wait for Lovable to respond
`

function buildInjectionScript(prompt: string): string {
  return `
(function() {
  const PROMPT = ${JSON.stringify(prompt)};
  const el =
    document.querySelector('textarea[placeholder]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('[contenteditable="true"]');
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) { setter.call(el, PROMPT); } else { el.value = PROMPT; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.focus();
    document.execCommand('selectAll', false, undefined);
    document.execCommand('insertText', false, PROMPT);
  }
  setTimeout(() => {
    const btn =
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('form button:last-of-type');
    if (btn && !btn.disabled) { btn.click(); }
    else { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); }
  }, 150);
  return true;
})()`.trim()
}

export function registerLovableHandlers(ipc: IpcMainLike): void {
  // Renderer reports current login state + URL of a Lovable node
  ipc.handle(
    'lovable:report-status',
    (_event, nodeId: string, status: { loggedIn: boolean; url: string }) => {
      nodeStatus.set(nodeId, { ...status, lastSeen: Date.now() })
    },
  )

  // Renderer asks for the compiled webview preload path
  ipc.handle('lovable:preload-path', () => {
    return join(__dirname, '../preload/lovableWebview.js')
  })

  // Create a temp session directory with a CLAUDE.md for the companion agent
  ipc.handle('lovable:create-session-dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'canvaflow-lovable-'))
    writeFileSync(join(dir, 'CLAUDE.md'), CLAUDE_MD)

    // Write .claude/settings.json so Claude Code auto-loads the Lovable MCP
    const mcpIndexPath = join(app.getAppPath(), 'mcps/lovable/index.ts')
    const claudeDir = join(dir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        mcpServers: {
          lovable: {
            command: 'bun',
            args: ['run', mcpIndexPath],
          },
        },
      }, null, 2)
    )

    return dir
  })

  // Check if the Lovable MCP is configured in the global ~/.claude.json
  ipc.handle('lovable:check-mcp-global', () => {
    const globalConfig = join(homedir(), '.claude.json')
    if (!existsSync(globalConfig)) return false
    try {
      const cfg = JSON.parse(readFileSync(globalConfig, 'utf8'))
      return !!(cfg?.mcpServers?.lovable)
    } catch {
      return false
    }
  })

  // Install the Lovable MCP into ~/.claude.json
  ipc.handle('lovable:install-mcp-global', () => {
    const globalConfig = join(homedir(), '.claude.json')
    const mcpIndexPath = join(app.getAppPath(), 'mcps/lovable/index.ts')
    let cfg: Record<string, unknown> = {}
    if (existsSync(globalConfig)) {
      try { cfg = JSON.parse(readFileSync(globalConfig, 'utf8')) } catch { /* ignore */ }
    }
    if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') {
      cfg.mcpServers = {}
    }
    ;(cfg.mcpServers as Record<string, unknown>).lovable = {
      command: 'bun',
      args: ['run', mcpIndexPath],
    }
    writeFileSync(globalConfig, JSON.stringify(cfg, null, 2))
  })

  startHttpBridge()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function findActiveNodeId(): string | null {
  // Prefer the most-recently-seen logged-in node
  let best: [string, NodeStatus] | null = null
  for (const entry of nodeStatus.entries()) {
    if (!entry[1].loggedIn) continue
    if (!best || entry[1].lastSeen > best[1].lastSeen) best = entry
  }
  // Fallback: any known node (user might not be logged in yet)
  if (!best) {
    const first = nodeStatus.entries().next()
    if (!first.done) return first.value[0]
  }
  return best?.[0] ?? null
}

// ---------------------------------------------------------------------------
// HTTP bridge — MCP server communicates here
// ---------------------------------------------------------------------------

function startHttpBridge(): void {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // GET /status — returns login state of all open Lovable nodes
    if (req.method === 'GET' && req.url === '/status') {
      const nodes = Array.from(nodeStatus.entries()).map(([nodeId, s]) => ({ nodeId, ...s }))
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, nodes }))
      return
    }

    // POST /send-prompt — inject prompt directly into the Lovable browser view
    if (req.method === 'POST' && req.url === '/send-prompt') {
      let body = ''
      req.on('data', (chunk) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const { prompt, nodeId } = JSON.parse(body)
          if (!prompt || typeof prompt !== 'string') {
            res.writeHead(400)
            res.end(JSON.stringify({ ok: false, error: 'prompt must be a non-empty string' }))
            return
          }
          if (!getMainWindow()) {
            res.writeHead(503)
            res.end(JSON.stringify({ ok: false, error: 'CanvaFlow window not available. Open the app first.' }))
            return
          }
          const targetNodeId =
            typeof nodeId === 'string' && nodeId ? nodeId : findActiveNodeId()
          if (!targetNodeId) {
            res.writeHead(503)
            res.end(JSON.stringify({ ok: false, error: 'No Lovable node found. Open a browser on lovable.dev first.' }))
            return
          }
          try {
            await executeBrowserViewJS(targetNodeId, buildInjectionScript(prompt))
            res.writeHead(200)
            res.end(JSON.stringify({ ok: true, targetNodeId, message: 'Prompt injected into Lovable' }))
          } catch {
            // Fallback: send via renderer IPC (for dedicated Lovable plugin nodes)
            getMainWindow()?.webContents.send('lovable:inject-prompt', targetNodeId, prompt)
            res.writeHead(200)
            res.end(JSON.stringify({ ok: true, targetNodeId, message: 'Prompt dispatched to Lovable' }))
          }
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`[lovable] MCP bridge ready at http://127.0.0.1:${HTTP_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[lovable] Port ${HTTP_PORT} already in use — bridge skipped`)
    } else {
      console.error('[lovable] HTTP bridge error:', err)
    }
  })
}
