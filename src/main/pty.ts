import { ipcMain, WebContents } from 'electron'
import * as os from 'os'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmuxManager } from './tmux'
import { AGENT_SIGNAL_PORT } from '../modules/servers/agentic_signals/shared/constants'
import { detectAgentStatusFromTerminalBuffer, sanitizeTerminalOutput } from '../modules/servers/agentic_signals/shared/detection'
import { logAgentDebug, summarizeText } from '../modules/servers/agentic_signals/shared/debug'
import { coordinatorOnData } from './agentCoordinator'
import { injectMcpConfig } from '../modules/servers/canvaflow_mcp/main/server'
import type { AgentStatus } from '../modules/servers/agentic_signals/shared/types'

interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): void
  pid: number
}

const ptys = new Map<string, IPty>()
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function setupPtyHandlers(getWebContents: () => WebContents | null): void {
  ipcMain.handle('terminal:create', async (_event, id: string, workspaceId: string, cwd: string, shell: string, cols?: number, rows?: number) => {
    if (ptys.has(id)) return

    const pty = await import('node-pty')
    const defaultShell = shell || process.env.SHELL || '/bin/zsh'
    // Expand ~ since node's spawn doesn't handle shell path expansion
    const rawCwd = cwd?.startsWith('~/') ? os.homedir() + cwd.slice(1)
                 : cwd === '~'           ? os.homedir()
                 : cwd || ''
    const defaultCwd = rawCwd || os.homedir()

    // Always run the shell directly — xterm.js owns scrollback natively.
    // tmux is used only to keep the background session alive for cwd/process persistence.
    // Starting/restoring is handled at the tmux session level, not by attaching here.
    // Strip TERM_SESSION_ID so zsh doesn't share/corrupt macOS shell session files
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { TERM_SESSION_ID: _sid, ...baseEnv } = process.env
    const canvaBin = join(os.homedir(), '.canvaflow', 'bin')
    const existingPath = baseEnv.PATH ?? ''
    const spawnOpts = {
      name: 'xterm-256color',
      // Use the renderer-supplied dimensions when available so the PTY (and the
      // process inside it) starts at the correct terminal size. Spawning at the
      // wrong size and resizing afterwards races with claude's startup banner
      // and produces literal escape-sequence artifacts.
      cols: cols && cols > 0 ? cols : 80,
      rows: rows && rows > 0 ? rows : 24,
      env: {
        ...baseEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CANVAFLOW_NODE_ID: id,
        CANVAFLOW_PORT: String(AGENT_SIGNAL_PORT),
        PATH: existingPath.includes(canvaBin) ? existingPath : `${canvaBin}:${existingPath}`,
      },
    }
    // Support shell strings with args (e.g. "claude --permission-mode bypassPermissions")
    const shellParts = defaultShell.split(/\s+/)
    let shellBin = shellParts[0]
    let shellArgs = shellParts.slice(1)

    // Claude startup race: claude queries the terminal (\e[c — Device Attributes)
    // and enables focus tracking (\e[?1004h) BEFORE switching the PTY to raw mode.
    // During that brief window the PTY is in cooked+echo mode, so xterm's responses
    // (\e[?1;2c, \e[O) get echoed back to stdout and appear as literal text
    // (^[[?1;2c, ^[[O) at the top of the terminal.
    //
    // Fix: disable echo on the PTY BEFORE claude starts, by wrapping the command
    // with `stty -echo` inside a bash subshell that then `exec`s claude. The exec
    // replaces bash so no extra process lingers, and claude inherits the no-echo
    // termios. When claude later switches to full raw mode, echo is already off
    // so nothing changes.
    if (shellBin === 'claude') {
      // Make sure the CanvaFlow MCP + SessionStart hook are installed in the cwd
      // BEFORE claude starts. Claude reads .claude/settings.json on startup, so
      // the file must already exist by the time we exec it. This catches every
      // spawn path (kanban, sidebar, manual, restart) in one place.
      try { injectMcpConfig(defaultCwd) } catch (e) { console.error('[pty] injectMcpConfig failed:', e) }

      const claudeCmd = [shellBin, ...shellArgs].join(' ')
      shellBin = 'bash'
      shellArgs = ['-c', `stty -echo 2>/dev/null; exec ${claudeCmd}`]
    }

    let ptyProcess: Awaited<ReturnType<typeof pty.spawn>>
    try {
      ptyProcess = pty.spawn(shellBin, shellArgs, { ...spawnOpts, cwd: defaultCwd })
    } catch {
      // cwd no longer exists — fall back to home directory
      ptyProcess = pty.spawn(shellBin, shellArgs, { ...spawnOpts, cwd: os.homedir() })
    }

    let statusBuf = ''

    const sendStatus = (status: AgentStatus) => {
      logAgentDebug('pty-main', 'emit-status', { nodeId: id, status })
      const wc = getWebContents()
      if (wc && !wc.isDestroyed()) wc.send('agent:status', { nodeId: id, status })
    }

    const clearIdleTimer = () => {
      const idleTimer = idleTimers.get(id)
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimers.delete(id)
      }
    }

    const resetIdleTimer = () => {
      clearIdleTimer()
      // If no tool-use or stop signal within 90s, assume Claude returned to idle
      idleTimers.set(id, setTimeout(() => {
        idleTimers.delete(id)
        sendStatus('idle')
      }, 90_000))
    }

    ptyProcess.onData((data: string) => {
      try {
        // Agent coordinator sees data FIRST — can intercept and write back
        coordinatorOnData(id, data, (d) => ptyProcess.write(d))

        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('terminal:data', id, data)

          const clean = sanitizeTerminalOutput(data)
          statusBuf = (statusBuf + clean).slice(-4096)

          const detected = detectAgentStatusFromTerminalBuffer(statusBuf)
          if (detected) {
            logAgentDebug('pty-main', 'detected-status-from-buffer', {
              nodeId: id,
              detected,
              chunk: summarizeText(clean),
              bufferTail: summarizeText(statusBuf.slice(-400)),
            })
            sendStatus(detected)
            if (detected === 'idle') {
              statusBuf = ''
              clearIdleTimer()
            } else {
              resetIdleTimer()
            }
          } else if (/What would you like to work on|Do you want to proceed|Esc to cancel|Enter to select/i.test(statusBuf)) {
            logAgentDebug('pty-main', 'prompt-like-buffer-without-detection', {
              nodeId: id,
              chunk: summarizeText(clean),
              bufferTail: summarizeText(statusBuf.slice(-400)),
            })
          }
        }
      } catch {
        // webContents destroyed mid-flight — ignore
      }
    })

    ptys.set(id, ptyProcess)

    // Ensure a background tmux session exists for this terminal (for future process persistence).
    // We don't attach to it — it just keeps running in the background.
    if (tmuxManager.isAvailable() && workspaceId) {
      const session = tmuxManager.sessionName(workspaceId, id)
      const exists = await tmuxManager.sessionExists(session)
      if (!exists) {
        await tmuxManager.createSession(session, defaultCwd, defaultShell).catch(() => {})
      }
    }
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    ptys.get(id)?.write(data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    try { ptys.get(id)?.resize(cols, rows) } catch { /* PTY already closed */ }
  })

  /**
   * Check whether a Claude Code session JSONL exists for a given cwd + session ID.
   * Used by ClaudeNode to decide whether `--resume <id>` is safe (the JSONL must
   * exist) or whether to fall back to a plain `claude` start.
   *
   * Claude stores sessions at: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
   * The encoded-cwd is the absolute cwd path with BOTH '/' AND '.' replaced by
   * '-'. So `/Users/foo/.worktrees/bar` becomes `-Users-foo--worktrees-bar`
   * (note the double dash where `/.` was).
   */
  ipcMain.handle('claude:sessionExists', (_event, cwd: string, sessionId: string): boolean => {
    if (!cwd || !sessionId) return false
    const rawCwd = cwd.startsWith('~/') ? os.homedir() + cwd.slice(1)
                 : cwd === '~'         ? os.homedir()
                 : cwd
    const encoded = rawCwd.replace(/[/.]/g, '-')
    const sessionPath = join(os.homedir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`)
    return existsSync(sessionPath)
  })

  ipcMain.handle('terminal:kill', async (_event, id: string, workspaceId: string, deleteSession: boolean) => {
    const proc = ptys.get(id)
    if (proc) {
      logAgentDebug('pty-main', 'terminal-kill', { nodeId: id, workspaceId, deleteSession })
      const wc = getWebContents()
      if (wc && !wc.isDestroyed()) wc.send('agent:status', { nodeId: id, status: 'idle' })
      const idleTimer = idleTimers.get(id)
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimers.delete(id)
      }
      try { proc.kill() } catch {}
      ptys.delete(id)
    }

    if (deleteSession && tmuxManager.isAvailable() && workspaceId) {
      const session = tmuxManager.sessionName(workspaceId, id)
      await tmuxManager.killSession(session)
    }
  })
}

export function killAllPtys(): void {
  for (const proc of ptys.values()) {
    try { proc.kill() } catch {}
  }
  ptys.clear()
  for (const idleTimer of idleTimers.values()) clearTimeout(idleTimer)
  idleTimers.clear()
}

export async function cleanupOrphanSessions(validNodeIds: string[]): Promise<void> {
  if (!tmuxManager.isAvailable()) return
  const sessions = await tmuxManager.listManagedSessions()
  for (const session of sessions) {
    const hasNode = validNodeIds.some((id) => session.includes(id))
    if (!hasNode) {
      console.log('[tmux] Killing orphan session:', session)
      await tmuxManager.killSession(session)
    }
  }
}
