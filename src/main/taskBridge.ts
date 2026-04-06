import { createServer } from 'http'
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import {
  createAgentTask,
  getAgentTask,
  updateAgentTaskStatus,
  getAgentTasksByOrchestrator,
  updateAgentTask,
} from './database'
import type { AgentTaskRow } from './database'

const TASK_BRIDGE_PORT = 7824

// ---------------------------------------------------------------------------
// IPC handlers — renderer ↔ main process
// ---------------------------------------------------------------------------

export function setupTaskHandlers(): void {
  ipcMain.handle('tasks:create', (_event, task: AgentTaskRow) => {
    createAgentTask(task)
    return { ok: true }
  })

  ipcMain.handle('tasks:get', (_event, id: string) => {
    return getAgentTask(id)
  })

  ipcMain.handle('tasks:updateStatus', (_event, id: string, status: string, result?: string) => {
    updateAgentTaskStatus(id, status, result)
    return { ok: true }
  })

  ipcMain.handle('tasks:listByOrchestrator', (_event, orchestratorId: string) => {
    return getAgentTasksByOrchestrator(orchestratorId)
  })

  ipcMain.handle('tasks:update', (_event, id: string, patch: Partial<Omit<AgentTaskRow, 'id' | 'createdAt'>>) => {
    updateAgentTask(id, patch)
    return { ok: true }
  })

  ipcMain.handle('tasks:mcpIndexPath', () => {
    return join(app.getAppPath(), 'mcps/canvaflow/index.ts')
  })

  // Write a temp MCP config JSON file for --mcp-config flag
  ipcMain.handle('tasks:mcpConfigFile', () => {
    const mcpIndexPath = join(app.getAppPath(), 'mcps/canvaflow/index.ts')
    const configDir = join(tmpdir(), 'canvaflow-mcp-configs')
    mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'canvaflow-mcp.json')
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        canvaflow: {
          command: 'bun',
          args: ['run', mcpIndexPath],
        },
      },
    }, null, 2))
    return configPath
  })

  startTaskBridge()
}

// ---------------------------------------------------------------------------
// HTTP bridge — MCP server queries this to read/write tasks from SQLite
// ---------------------------------------------------------------------------

function startTaskBridge(): void {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')

    // GET /task/:id
    if (req.method === 'GET' && req.url?.startsWith('/task/')) {
      const id = req.url.slice('/task/'.length)
      const task = getAgentTask(id)
      if (!task) {
        res.writeHead(404)
        res.end(JSON.stringify({ ok: false, error: 'Task not found' }))
        return
      }
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, task }))
      return
    }

    // GET /siblings/:orchestratorId
    if (req.method === 'GET' && req.url?.startsWith('/siblings/')) {
      const orchestratorId = req.url.slice('/siblings/'.length)
      const tasks = getAgentTasksByOrchestrator(orchestratorId)
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, tasks }))
      return
    }

    // POST /task/:id/status — { status, result? }
    if (req.method === 'POST' && req.url?.match(/^\/task\/[^/]+\/status$/)) {
      const id = req.url.split('/')[2]
      let body = ''
      req.on('data', (chunk) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { status, result } = JSON.parse(body)
          if (!status) {
            res.writeHead(400)
            res.end(JSON.stringify({ ok: false, error: 'status is required' }))
            return
          }
          updateAgentTaskStatus(id, status, result)
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })

  server.listen(TASK_BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[tasks] MCP bridge ready at http://127.0.0.1:${TASK_BRIDGE_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[tasks] Port ${TASK_BRIDGE_PORT} already in use — bridge skipped`)
    } else {
      console.error('[tasks] HTTP bridge error:', err)
    }
  })
}
