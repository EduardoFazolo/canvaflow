import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
  OrchestratorStreamEvent,
} from '../shared/types'

function truncate(s: string, max = 300): string {
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

  const sendStream = (text: string): void => {
    send<OrchestratorStreamEvent>('orchestrator:stream', { orchestratorId, text })
  }

  sendStatus('thinking', 'Starting Claude…')

  const prompt = PROMPT(payload.task, payload.markdown)

  const proc = spawn('claude', ['-p', '--output-format', 'stream-json'], {
    shell: true,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  activeRuns.set(orchestratorId, proc)

  let fullText = ''
  let stderr = ''
  let lineBuffer = ''

  const timeout = setTimeout(() => {
    proc.kill()
    sendStatus('error', 'Claude timed out after 2 minutes')
    activeRuns.delete(orchestratorId)
  }, 120_000)

  proc.stdout.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString()

    // stream-json outputs one JSON object per line
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? '' // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line.trim())

        if (event.type === 'assistant' && event.subtype === 'text') {
          fullText += event.content
          sendStream(fullText)
          sendStatus('thinking', 'Claude is responding…')
        } else if (event.type === 'result') {
          // Final result — use this for parsing
          if (event.is_error) {
            sendStatus('error', truncate(event.result ?? 'Unknown error'))
            return
          }
          if (event.result) fullText = event.result
        }
      } catch {
        // not valid JSON line, skip
      }
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

  proc.on('error', (err) => {
    clearTimeout(timeout)
    activeRuns.delete(orchestratorId)
    sendStatus('error', `Failed to run claude: ${err.message}`)
  })

  proc.on('close', (code) => {
    clearTimeout(timeout)
    activeRuns.delete(orchestratorId)

    // Process any remaining buffered line
    if (lineBuffer.trim()) {
      try {
        const event = JSON.parse(lineBuffer.trim())
        if (event.type === 'result' && event.result) fullText = event.result
        if (event.is_error) {
          sendStatus('error', truncate(event.result ?? 'Unknown error'))
          return
        }
      } catch {}
    }

    if (code !== 0) {
      const errMsg = stderr.trim() || fullText.trim() || `claude exited with code ${code}`
      sendStatus('error', truncate(errMsg))
      return
    }

    // Extract JSON array from the accumulated text
    const match = fullText.match(/\[[\s\S]*\]/)
    if (!match) {
      sendStatus('error', truncate(fullText) || 'No response from Claude')
      return
    }

    let agents: SubagentDef[]
    try {
      agents = JSON.parse(match[0]) as SubagentDef[]
    } catch {
      sendStatus('error', truncate(fullText) || 'Invalid JSON in response')
      return
    }

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
}

export function cancelOrchestrator(orchestratorId: string): void {
  const proc = activeRuns.get(orchestratorId)
  if (proc) {
    proc.kill()
    activeRuns.delete(orchestratorId)
  }
}
