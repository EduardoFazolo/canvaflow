import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
} from '../shared/types'

/** Trim long error messages so they fit in the status UI */
function truncate(s: string, max = 300): string {
  // Strip ANSI escape codes
  const clean = s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

const ORCHESTRATOR_W = 520
const SUBAGENT_H = 180
const SUBAGENT_GAP = 50

const PROMPT = (task: string, markdown: string) => `
You are a task orchestrator. Break down the following task into 2-5 focused, parallel sub-tasks for specialized agents.

Task: ${task}
${markdown ? `\nDetails:\n${markdown}` : ''}

Respond ONLY with a valid JSON array (no markdown fences, no explanation):
[{"title": "Short Title", "task": "1-3 sentence description of what this agent should work on"}, ...]

Rules:
- Keep titles under 30 characters
- Make sub-tasks as independent as possible
- Be concrete and actionable
`.trim()

interface SubagentDef {
  title: string
  task: string
}

// Active runs — keyed by orchestratorId
const activeRuns = new Map<string, ReturnType<typeof spawn>>()

export function runOrchestrator(
  payload: OrchestratorStartPayload,
  orchestratorId: string,
  webContents: WebContents,
): void {
  const send = <T>(channel: string, data: T): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, data)
  }

  const sendStatus = (status: OrchestratorStatusEvent['status'], message?: string): void => {
    send<OrchestratorStatusEvent>('orchestrator:status', { orchestratorId, status, message })
  }

  sendStatus('thinking', 'Analyzing task…')

  const prompt = PROMPT(payload.task, payload.markdown)

  // Pass the prompt via stdin — avoids shell mangling of multi-line text
  const proc = spawn('claude', ['-p', '--output-format', 'json'], {
    shell: true,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  activeRuns.set(orchestratorId, proc)

  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

  proc.on('close', (code) => {
    activeRuns.delete(orchestratorId)

    if (code !== 0) {
      // Show stderr, or stdout (may contain auth/rate-limit messages), or a generic fallback
      const errMsg = stderr.trim() || stdout.trim() || `claude exited with code ${code}`
      sendStatus('error', truncate(errMsg))
      return
    }

    // The CLI outputs a JSON envelope: { result: "..." }
    let text = stdout.trim()
    try {
      const envelope = JSON.parse(text) as { result?: string; is_error?: boolean }
      if (envelope.is_error) {
        sendStatus('error', truncate(envelope.result ?? 'Unknown error'))
        return
      }
      if (envelope.result) text = envelope.result
    } catch {
      // not an envelope, use raw text
    }

    // Extract JSON array from the text (Claude might wrap it anyway)
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      // Show what Claude actually said instead of a generic parse error
      sendStatus('error', truncate(text) || 'No response from Claude')
      return
    }

    let agents: SubagentDef[]
    try {
      agents = JSON.parse(match[0]) as SubagentDef[]
    } catch {
      sendStatus('error', truncate(text) || 'Invalid JSON in response')
      return
    }

    // Spawn subagent nodes
    agents.forEach((agent, idx) => {
      const subagentX = payload.worldX + ORCHESTRATOR_W + 80
      const subagentY = payload.worldY + idx * (SUBAGENT_H + SUBAGENT_GAP)

      send<SubagentSpawnedEvent>('orchestrator:node-created', {
        orchestratorId,
        agentId: `subagent-${orchestratorId}-${idx}`,
        title: (agent.title ?? `Agent ${idx + 1}`).slice(0, 40),
        task: agent.task ?? '',
        worldX: subagentX,
        worldY: subagentY,
      })
    })

    sendStatus('done', `Spawned ${agents.length} agent${agents.length !== 1 ? 's' : ''}`)
  })

  proc.on('error', (err) => {
    activeRuns.delete(orchestratorId)
    sendStatus('error', `Failed to run claude: ${err.message}`)
  })
}

export function cancelOrchestrator(orchestratorId: string): void {
  const proc = activeRuns.get(orchestratorId)
  if (proc) {
    proc.kill()
    activeRuns.delete(orchestratorId)
  }
}
