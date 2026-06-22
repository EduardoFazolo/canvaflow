import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
} from '../shared/types'

const ORCHESTRATOR_W = 520
// Space subagents using Claude node height (480) so they don't overlap when launched
const SUBAGENT_H = 480
const SUBAGENT_GAP = 40

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

  const sendStatus = (
    status: OrchestratorStatusEvent['status'],
    message?: string,
    streamText?: string,
  ): void => {
    send<OrchestratorStatusEvent>('orchestrator:status', {
      orchestratorId,
      status,
      message,
      streamText,
    })
  }

  sendStatus('thinking', 'Analyzing task…')

  const prompt = PROMPT(payload.task, payload.markdown)

  // Use Haiku for speed + stream-json for real-time updates
  const proc = spawn(
    'claude',
    ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'haiku'],
    {
      shell: true,
      // Own process group so we can signal the whole tree (shell → claude → bun
      // MCP servers) on cancel/quit instead of orphaning the grandchildren.
      detached: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  proc.stdin.write(prompt)
  proc.stdin.end()

  activeRuns.set(orchestratorId, proc)

  let fullText = ''
  let lineBuf = ''
  let spawnedCount = 0
  let isDone = false
  let hasError = false

  const trySpawnAgents = (): void => {
    // Try to parse complete JSON objects from the accumulated text as they appear
    // Look for individual agent objects: {"title": "...", "task": "..."}
    const agents = parseAgentsFromPartialText(fullText)
    if (agents.length > spawnedCount) {
      // Spawn newly discovered agents
      for (let i = spawnedCount; i < agents.length; i++) {
        const agent = agents[i]
        const subagentX = payload.worldX + ORCHESTRATOR_W + 80
        const subagentY = payload.worldY + i * (SUBAGENT_H + SUBAGENT_GAP)

        send<SubagentSpawnedEvent>('orchestrator:node-created', {
          orchestratorId,
          agentId: `subagent-${orchestratorId}-${i}`,
          title: (agent.title ?? `Agent ${i + 1}`).slice(0, 40),
          task: agent.task ?? '',
          worldX: subagentX,
          worldY: subagentY,
          workspacePath: payload.workspacePath,
        })

        sendStatus('spawning', `Created sub-agent: ${agent.title}`, fullText)
      }
      spawnedCount = agents.length
    }
  }

  const processLine = (line: string): void => {
    if (!line.trim()) return

    let event: any
    try {
      event = JSON.parse(line)
    } catch {
      return
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          fullText += block.text
          sendStatus('streaming', 'Breaking down tasks…', fullText)
          // Try to spawn agents as soon as we can parse them from partial text
          trySpawnAgents()
        } else if (block.type === 'thinking' && block.thinking) {
          sendStatus('thinking', 'Thinking…')
        }
      }
    } else if (event.type === 'result') {
      isDone = true
      if (event.is_error) {
        hasError = true
        sendStatus('error', event.result ?? 'Claude returned an error')
        return
      }
      // Use the final result text if we haven't extracted it from stream
      if (event.result && !fullText) {
        fullText = event.result
      }
    }
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    lineBuf += chunk.toString()
    // Process complete lines (stream-json is newline-delimited)
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? '' // keep incomplete last line in buffer
    for (const line of lines) {
      processLine(line)
    }
  })

  proc.stderr.on('data', () => {
    // stderr is noisy with stream-json, ignore unless process fails
  })

  proc.on('close', (code) => {
    activeRuns.delete(orchestratorId)

    // Process any remaining buffered data
    if (lineBuf.trim()) processLine(lineBuf)

    if (hasError) return // already sent error

    if (code !== 0 && !isDone) {
      sendStatus('error', `Claude exited with code ${code}`)
      return
    }

    // Final attempt to spawn any remaining agents
    trySpawnAgents()

    if (spawnedCount === 0) {
      // Fallback: try full-text parsing if incremental parsing found nothing
      const agents = parseAgentResponse(fullText)
      if (typeof agents === 'string') {
        sendStatus('error', agents)
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
          workspacePath: payload.workspacePath,
        })
      })
      spawnedCount = agents.length
    }

    if (spawnedCount > 0) {
      sendStatus('done', `Spawned ${spawnedCount} agent${spawnedCount !== 1 ? 's' : ''}`)
    } else {
      const preview = fullText.length > 300 ? fullText.slice(0, 300) + '…' : fullText
      sendStatus('error', `Could not find tasks in response:\n${preview}`)
    }
  })

  proc.on('error', (err) => {
    activeRuns.delete(orchestratorId)
    sendStatus('error', `Failed to run claude: ${err.message}`)
  })
}

/**
 * Incrementally parse agent objects from partial streaming text.
 * Finds complete {"title": "...", "task": "..."} objects even in incomplete JSON arrays.
 */
function parseAgentsFromPartialText(text: string): SubagentDef[] {
  const agents: SubagentDef[] = []

  // Match individual JSON objects with title and task fields
  const objectRegex = /\{[^{}]*"title"\s*:\s*"([^"]*)"[^{}]*"task"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[^{}]*\}/g
  let match: RegExpExecArray | null

  while ((match = objectRegex.exec(text)) !== null) {
    const title = match[1]
    let task = match[2]
    try {
      task = JSON.parse(`"${task}"`)
    } catch {
      // use as-is
    }
    if (title || task) {
      agents.push({ title, task })
    }
  }

  // Also try reversed field order: task before title
  const reversedRegex = /\{[^{}]*"task"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[^{}]*"title"\s*:\s*"([^"]*)"[^{}]*\}/g
  while ((match = reversedRegex.exec(text)) !== null) {
    let task = match[1]
    const title = match[2]
    try {
      task = JSON.parse(`"${task}"`)
    } catch {
      // use as-is
    }
    // Avoid duplicates (check if we already have this title)
    if ((title || task) && !agents.some((a) => a.title === title)) {
      agents.push({ title, task })
    }
  }

  return agents
}

/**
 * Fallback: parse the full Claude response into SubagentDef[].
 * Returns the array on success, or an error string on failure.
 */
function parseAgentResponse(raw: string): SubagentDef[] | string {
  let text = raw

  // Try to parse as JSON envelope
  try {
    const envelope = JSON.parse(text) as { result?: string; is_error?: boolean }
    if (envelope.is_error) return envelope.result ?? 'Claude returned an error'
    if (envelope.result) text = envelope.result
  } catch {
    // Not an envelope
  }

  // Strip markdown code fences
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')

  // Extract JSON array
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
    return `Could not find task list in response:\n${preview}`
  }

  try {
    const agents = JSON.parse(match[0]) as SubagentDef[]
    if (!Array.isArray(agents)) return 'Response was not an array'
    return agents.filter((a) => a && (a.task || a.title))
  } catch (e) {
    const preview = match[0].length > 200 ? match[0].slice(0, 200) + '…' : match[0]
    return `Invalid JSON: ${(e as Error).message}\n${preview}`
  }
}

// Kill the whole process group (shell → claude → bun MCP), not just the leader.
function killRun(proc: ReturnType<typeof spawn>): void {
  if (proc.pid) {
    try { process.kill(-proc.pid, 'SIGTERM') } catch {
      try { process.kill(proc.pid, 'SIGTERM') } catch {}
    }
  }
  try { proc.kill() } catch {}
}

export function cancelOrchestrator(orchestratorId: string): void {
  const proc = activeRuns.get(orchestratorId)
  if (proc) {
    killRun(proc)
    activeRuns.delete(orchestratorId)
  }
}

// Cleanup hook for app quit — tear down every in-flight orchestrator run.
export function killAllOrchestrators(): void {
  for (const proc of activeRuns.values()) killRun(proc)
  activeRuns.clear()
}
