import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import type {
  CoordinatorStartPayload,
  CoordinatorResultEvent,
  CoordinatorTaskDef,
} from '../shared/types'

const PROMPT = (task: string, markdown: string) => `
You are a task coordinator for a software project. Your job is to analyze a task description and decide whether it should be broken down into smaller, well-ordered sub-tasks.

Task: ${task}
${markdown ? `\nDetails:\n${markdown}` : ''}

INSTRUCTIONS:
1. First, decide if this task is too small to break down. A task is "too small" if it's a single, focused piece of work that one developer could do in one sitting without needing to test intermediate steps. If too small, respond with exactly: {"too_small": true}

2. If the task SHOULD be broken down, analyze it and create ordered sub-tasks following these rules:

ORDERING RULES:
- Order by user-testable dependency: what must exist first for a user to verify the next piece works?
- Example: "Use an API via a button" → 1) Create the button (user can see it) → 2) Wire button to call API (user can click and test) → 3) Implement the API endpoint (user can test full flow)
- This guarantees each step produces something a user can verify before moving on.

GROUPING RULES:
- Merge small, trivial tasks that would be wasteful as standalone items.
- Group tightly-coupled logic that MUST be developed together (e.g., a type definition and its only consumer).
- Keep tasks that touch different areas of the codebase separate.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object (no markdown fences, no explanation):
{
  "tasks": [
    {
      "title": "Short task title (under 40 chars)",
      "description": "Concise 1-3 sentence description. Include relevant file paths if known. Be specific about what to implement.",
      "order": 1,
      "dependsOnIndices": [],
      "files": ["src/path/to/relevant/file.ts"]
    },
    {
      "title": "Next task",
      "description": "Description referencing what the previous task created.",
      "order": 2,
      "dependsOnIndices": [0],
      "files": []
    }
  ]
}

RULES:
- Keep titles under 40 characters
- Descriptions should be concise but actionable — mention file paths, function names, or component names when possible
- Each task's description should be self-contained enough that an agent can work on it without needing the full context
- Use dependsOnIndices to reference which tasks (by 0-based array index) must be done first
- The "files" field helps save tokens for agents — list files they'll likely need to read or modify
- Aim for 2-7 tasks. If you'd produce more than 7, merge related work more aggressively.
`.trim()

// Active runs — keyed by coordinatorId
const activeRuns = new Map<string, ReturnType<typeof spawn>>()

export function runCoordinator(
  payload: CoordinatorStartPayload,
  coordinatorId: string,
  webContents: WebContents,
): void {
  const send = <T>(channel: string, data: T): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, data)
  }

  const sendStatus = (
    status: CoordinatorResultEvent['status'],
    message?: string,
    streamText?: string,
    tasks?: CoordinatorTaskDef[],
  ): void => {
    send<CoordinatorResultEvent>('coordinator-planner:status', {
      coordinatorId,
      status,
      message,
      streamText,
      tasks,
    })
  }

  sendStatus('thinking', 'Analyzing task…')

  const prompt = PROMPT(payload.task, payload.markdown)

  const proc = spawn(
    'claude',
    ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'sonnet'],
    {
      shell: true,
      env: { ...process.env },
      cwd: payload.workspacePath || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  proc.stdin.write(prompt)
  proc.stdin.end()

  activeRuns.set(coordinatorId, proc)

  let fullText = ''
  let lineBuf = ''
  let isDone = false
  let hasError = false

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
          sendStatus('streaming', 'Breaking down task…', fullText)
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
      if (event.result && !fullText) {
        fullText = event.result
      }
    }
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    lineBuf += chunk.toString()
    const lines = lineBuf.split('\n')
    lineBuf = lines.pop() ?? ''
    for (const line of lines) {
      processLine(line)
    }
  })

  proc.stderr.on('data', () => {
    // Ignore stderr noise from stream-json
  })

  proc.on('close', (code) => {
    activeRuns.delete(coordinatorId)

    if (lineBuf.trim()) processLine(lineBuf)

    if (hasError) return

    if (code !== 0 && !isDone) {
      sendStatus('error', `Claude exited with code ${code}`)
      return
    }

    // Parse the final response
    const result = parseCoordinatorResponse(fullText)

    if (typeof result === 'string') {
      sendStatus('error', result)
      return
    }

    if (result.tooSmall) {
      sendStatus('too_small', 'Task is small enough — no breakdown needed.')
      return
    }

    if (result.tasks.length === 0) {
      sendStatus('error', 'Coordinator produced no tasks.')
      return
    }

    sendStatus('done', `Created ${result.tasks.length} task${result.tasks.length !== 1 ? 's' : ''}`, fullText, result.tasks)
  })

  proc.on('error', (err) => {
    activeRuns.delete(coordinatorId)
    sendStatus('error', `Failed to run claude: ${err.message}`)
  })
}

interface ParseResult {
  tooSmall: boolean
  tasks: CoordinatorTaskDef[]
}

function parseCoordinatorResponse(raw: string): ParseResult | string {
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

  // Try to find a JSON object
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
    return `Could not find JSON in response:\n${preview}`
  }

  try {
    const parsed = JSON.parse(match[0])

    // Check for too_small response
    if (parsed.too_small === true) {
      return { tooSmall: true, tasks: [] }
    }

    // Parse tasks array
    if (!Array.isArray(parsed.tasks)) {
      return 'Response did not contain a "tasks" array'
    }

    const tasks: CoordinatorTaskDef[] = parsed.tasks
      .filter((t: any) => t && (t.title || t.description))
      .map((t: any, i: number) => ({
        title: (t.title ?? `Task ${i + 1}`).slice(0, 60),
        description: t.description ?? '',
        order: typeof t.order === 'number' ? t.order : i + 1,
        dependsOnIndices: Array.isArray(t.dependsOnIndices) ? t.dependsOnIndices : [],
        files: Array.isArray(t.files) ? t.files : [],
      }))

    return { tooSmall: false, tasks }
  } catch (e) {
    const preview = match[0].length > 200 ? match[0].slice(0, 200) + '…' : match[0]
    return `Invalid JSON: ${(e as Error).message}\n${preview}`
  }
}

export function cancelCoordinator(coordinatorId: string): void {
  const proc = activeRuns.get(coordinatorId)
  if (proc) {
    proc.kill()
    activeRuns.delete(coordinatorId)
  }
}
