/**
 * Agent Coordinator (Main Process)
 *
 * Lives in the main process alongside the PTY manager. Since PTY.onData
 * fires from the very first byte, there is ZERO race condition — we never
 * miss a prompt or output.
 *
 * The coordinator:
 *  1. Hooks into the PTY data stream for registered agents
 *  2. Detects and auto-accepts interactive prompts (permissions, y/n, etc.)
 *  3. Detects when Claude is ready (input prompt visible) and injects the task
 *  4. Monitors the agent for the entire session, handling mid-run prompts
 *  5. Reports status back to the renderer via IPC
 */

import { ipcMain, type WebContents } from 'electron'

// ---------------------------------------------------------------------------
// ANSI stripping
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x0f|\x0e|\r/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

// ---------------------------------------------------------------------------
// Prompt patterns
// ---------------------------------------------------------------------------

interface PromptPattern {
  id: string
  detect: RegExp
  /** The keystrokes to send to the PTY */
  response: string
  /** Delay (ms) before sending the response */
  delayMs: number
  /** Can this pattern fire more than once per agent session? */
  repeatable: boolean
}

const PROMPT_PATTERNS: PromptPattern[] = [
  {
    id: 'bypass-permissions',
    detect: /Yes, I accept/,
    response: '\x1b[B\r', // down arrow + enter
    delayMs: 200,
    repeatable: false,
  },
  {
    id: 'yn-confirm',
    detect: /\(y\/n\)\s*$/m,
    response: 'y',
    delayMs: 100,
    repeatable: true,
  },
  {
    id: 'Yn-proceed',
    detect: /\(Y\/n\)/,
    response: 'Y',
    delayMs: 100,
    repeatable: true,
  },
]

// Claude is ready when we see the input prompt character
const READY_PATTERNS = [
  /❯\s*$/m,         // Claude Code's default prompt
  />\s*$/m,          // fallback prompt
  /\$ $/m,           // shell prompt (shouldn't happen but safety net)
]

// ---------------------------------------------------------------------------
// Tracked agent state
// ---------------------------------------------------------------------------

type AgentPhase = 'booting' | 'accepting-prompt' | 'ready' | 'working' | 'done'

interface TrackedAgent {
  nodeId: string
  task: string
  phase: AgentPhase
  buffer: string
  taskSent: boolean
  firedPatterns: Set<string>
  writeFn: ((data: string) => void) | null
}

// ---------------------------------------------------------------------------
// Coordinator singleton
// ---------------------------------------------------------------------------

const agents = new Map<string, TrackedAgent>()
let _getWebContents: (() => WebContents | null) | null = null

/**
 * Register an agent to be coordinated. Call this BEFORE the PTY is created
 * so the data hook is ready when the first byte arrives.
 */
function registerAgent(nodeId: string, task: string): void {
  // Remove any stale registration
  agents.delete(nodeId)
  agents.set(nodeId, {
    nodeId,
    task,
    phase: 'booting',
    buffer: '',
    taskSent: false,
    firedPatterns: new Set(),
    writeFn: null,
  })
}

/**
 * Unregister an agent (cleanup).
 */
function unregisterAgent(nodeId: string): void {
  agents.delete(nodeId)
}

/**
 * Called by the PTY manager for every chunk of data from the PTY.
 * This is the hook point — called from pty.ts inside ptyProcess.onData.
 */
export function coordinatorOnData(nodeId: string, data: string, writeFn: (data: string) => void): void {
  const agent = agents.get(nodeId)
  if (!agent) return

  // Store the write function so we can write to the PTY
  if (!agent.writeFn) agent.writeFn = writeFn

  // Append to rolling buffer (keep last 4000 chars)
  agent.buffer += data
  if (agent.buffer.length > 4000) {
    agent.buffer = agent.buffer.slice(-4000)
  }

  const clean = stripAnsi(agent.buffer)

  // --- Phase: BOOTING or ACCEPTING-PROMPT ---
  if (agent.phase === 'booting' || agent.phase === 'accepting-prompt') {
    // Check auto-accept patterns first
    for (const pattern of PROMPT_PATTERNS) {
      if (!pattern.repeatable && agent.firedPatterns.has(pattern.id)) continue
      if (pattern.detect.test(clean)) {
        agent.firedPatterns.add(pattern.id)
        agent.phase = 'accepting-prompt'
        agent.buffer = '' // clear so we don't re-match
        emitCoordinatorStatus(nodeId, 'accepting-prompt', `Auto-accepting: ${pattern.id}`)
        setTimeout(() => {
          agent.writeFn?.(pattern.response)
        }, pattern.delayMs)
        return // one action per data chunk
      }
    }

    // Check if Claude is ready for input
    if (!agent.taskSent) {
      for (const readyRe of READY_PATTERNS) {
        if (readyRe.test(clean)) {
          agent.taskSent = true
          agent.phase = 'ready'
          agent.buffer = ''
          emitCoordinatorStatus(nodeId, 'injecting-task', 'Claude ready, sending task')
          setTimeout(() => {
            // Write the task text, then \r to submit (Enter key in PTY is \r, not \n)
            agent.writeFn?.(agent.task + '\r')
            agent.phase = 'working'
            emitCoordinatorStatus(nodeId, 'working', 'Task sent')
          }, 300)
          return
        }
      }
    }
  }

  // --- Phase: WORKING ---
  // Keep watching for mid-run prompts that need auto-acceptance
  if (agent.phase === 'working') {
    for (const pattern of PROMPT_PATTERNS) {
      if (!pattern.repeatable && agent.firedPatterns.has(pattern.id)) continue
      if (pattern.detect.test(clean)) {
        agent.firedPatterns.add(pattern.id)
        agent.buffer = ''
        emitCoordinatorStatus(nodeId, 'auto-accepting', `Mid-run auto-accept: ${pattern.id}`)
        setTimeout(() => {
          agent.writeFn?.(pattern.response)
        }, pattern.delayMs)
        return
      }
    }
  }
}

/**
 * Check if a node is coordinated.
 */
export function isCoordinated(nodeId: string): boolean {
  return agents.has(nodeId)
}

/**
 * Send coordinator status to the renderer.
 */
function emitCoordinatorStatus(nodeId: string, phase: string, message: string): void {
  const wc = _getWebContents?.()
  if (wc && !wc.isDestroyed()) {
    wc.send('coordinator:status', { nodeId, phase, message })
  }
}

// ---------------------------------------------------------------------------
// IPC setup — called once at app startup
// ---------------------------------------------------------------------------

export function setupCoordinatorHandlers(getWebContents: () => WebContents | null): void {
  _getWebContents = getWebContents

  ipcMain.handle('coordinator:register', (_e, nodeId: string, task: string) => {
    registerAgent(nodeId, task)
  })

  ipcMain.handle('coordinator:unregister', (_e, nodeId: string) => {
    unregisterAgent(nodeId)
  })

  ipcMain.handle('coordinator:status', () => {
    return Array.from(agents.values()).map((a) => ({
      nodeId: a.nodeId,
      phase: a.phase,
      taskSent: a.taskSent,
    }))
  })
}
