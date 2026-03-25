import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { WebContents } from 'electron'
import type {
  OrcV2StartPayload,
  OrcV2StatusEvent,
  RepoAgentSpawnedEvent,
  RepoAgentDef,
  AgentCommitEvent,
  ConflictDetectedEvent,
  MergeProgressEvent,
} from '../shared/types'

const ORCHESTRATOR_W = 560
const AGENT_NODE_H = 520
const AGENT_NODE_GAP = 40

const PROMPT = (task: string, markdown: string) => `
You are a task orchestrator. Break down the following task into 2-5 focused, parallel sub-tasks for specialized agents.

Each agent will work in its OWN CLONE of the repository on its OWN BRANCH.

Task: ${task}
${markdown ? `\nDetails:\n${markdown}` : ''}

Respond ONLY with a valid JSON array (no markdown fences, no explanation):
[{"title": "Short Title", "task": "1-3 sentence description", "branch": "feat/short-kebab-name"}, ...]

Rules:
- Keep titles under 30 characters
- Branch names must start with "feat/" and be unique
- Make sub-tasks as independent as possible — minimize file overlap
- Be concrete and actionable
`.trim()

// Active orchestrator runs
const activeRuns = new Map<string, { proc: ReturnType<typeof spawn>; pollTimer?: ReturnType<typeof setInterval>; clonePaths: string[] }>()

/**
 * Create a local --shared clone of the source repo into a temp directory.
 * Returns the absolute path of the clone.
 */
function cloneRepo(sourceRepo: string, branch: string, agentIndex: number, orchestratorId: string): string {
  const base = join(tmpdir(), 'canvaflow-v2', orchestratorId)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  const clonePath = join(base, `agent-${agentIndex}`)

  // --local --shared: hardlinks object store, near-instant, minimal disk
  execSync(`git clone --local --shared "${sourceRepo}" "${clonePath}"`, {
    stdio: 'pipe',
    timeout: 30_000,
  })

  // Create and checkout the agent's branch
  execSync(`git checkout -b "${branch}"`, {
    cwd: clonePath,
    stdio: 'pipe',
    timeout: 10_000,
  })

  return clonePath
}

/**
 * Get the latest commit hashes and changed files for a branch in a repo.
 */
function getRecentCommits(repoPath: string, sinceHash?: string): Array<{ hash: string; message: string; files: string[] }> {
  try {
    const range = sinceHash ? `${sinceHash}..HEAD` : 'HEAD~5..HEAD'
    const raw = execSync(
      `git log --format="%H|||%s" --name-only ${range} 2>/dev/null || true`,
      { cwd: repoPath, encoding: 'utf-8', timeout: 5_000 },
    ).trim()

    if (!raw) return []

    const commits: Array<{ hash: string; message: string; files: string[] }> = []
    const blocks = raw.split('\n\n')
    for (const block of blocks) {
      const lines = block.split('\n').filter(Boolean)
      if (lines.length === 0) continue
      const [header, ...fileLines] = lines
      const parts = header.split('|||')
      if (parts.length < 2) continue
      commits.push({
        hash: parts[0],
        message: parts[1],
        files: fileLines.filter((f) => f && !f.includes('|||')),
      })
    }
    return commits
  } catch {
    return []
  }
}

/**
 * Detect file overlaps between agents' changed files.
 */
function detectConflicts(
  agentFiles: Map<string, Set<string>>,
): Array<{ agentA: string; agentB: string; files: string[] }> {
  const conflicts: Array<{ agentA: string; agentB: string; files: string[] }> = []
  const agents = Array.from(agentFiles.entries())

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const [idA, filesA] = agents[i]
      const [idB, filesB] = agents[j]
      const overlap = Array.from(filesA).filter((f) => filesB.has(f))
      if (overlap.length > 0) {
        conflicts.push({ agentA: idA, agentB: idB, files: overlap })
      }
    }
  }

  return conflicts
}

export function runOrchestratorV2(
  payload: OrcV2StartPayload,
  orchestratorId: string,
  webContents: WebContents,
): void {
  const send = <T>(channel: string, data: T): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, data)
  }

  const sendStatus = (
    status: OrcV2StatusEvent['status'],
    message?: string,
    streamText?: string,
  ): void => {
    send<OrcV2StatusEvent>('orcv2:status', {
      orchestratorId,
      status,
      message,
      streamText,
    })
  }

  sendStatus('thinking', 'Analyzing task…')

  const prompt = PROMPT(payload.task, payload.markdown)

  const proc = spawn(
    'claude',
    ['-p', '--output-format', 'stream-json', '--verbose', '--model', 'haiku'],
    {
      shell: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  proc.stdin.write(prompt)
  proc.stdin.end()

  const run = { proc, clonePaths: [] as string[], pollTimer: undefined as ReturnType<typeof setInterval> | undefined }
  activeRuns.set(orchestratorId, run)

  let fullText = ''
  let lineBuf = ''
  let spawnedCount = 0
  let isDone = false
  let hasError = false

  // Track commits per agent for conflict detection
  const agentLastHash = new Map<string, string>()
  const agentFiles = new Map<string, Set<string>>()
  const agentRepos = new Map<string, { repoPath: string; branch: string; agentId: string }>()

  const trySpawnAgents = (): void => {
    const agents = parseAgentsFromPartialText(fullText)
    if (agents.length <= spawnedCount) return

    sendStatus('cloning', `Cloning repos…`)

    for (let i = spawnedCount; i < agents.length; i++) {
      const agent = agents[i]
      const branch = agent.branch || `feat/agent-${i}`

      let repoPath: string
      try {
        repoPath = cloneRepo(payload.workspacePath, branch, i, orchestratorId)
        run.clonePaths.push(repoPath)
      } catch (err) {
        sendStatus('error', `Failed to clone for agent ${i}: ${(err as Error).message}`)
        continue
      }

      const agentId = `orcv2-agent-${orchestratorId}-${i}`
      const agentX = payload.worldX + ORCHESTRATOR_W + 80
      const agentY = payload.worldY + i * (AGENT_NODE_H + AGENT_NODE_GAP)

      agentRepos.set(agentId, { repoPath, branch, agentId })
      agentFiles.set(agentId, new Set())

      send<RepoAgentSpawnedEvent>('orcv2:agent-spawned', {
        orchestratorId,
        agentId,
        title: (agent.title ?? `Agent ${i + 1}`).slice(0, 40),
        task: agent.task ?? '',
        branch,
        repoPath,
        colorIndex: i,
        worldX: agentX,
        worldY: agentY,
      })

      sendStatus('spawning', `Created agent: ${agent.title}`, fullText)
    }
    spawnedCount = agents.length
  }

  /**
   * Poll all agent repos for new commits and detect conflicts.
   */
  const pollCommits = (): void => {
    for (const [agentId, { repoPath, branch }] of agentRepos.entries()) {
      const lastHash = agentLastHash.get(agentId)
      const commits = getRecentCommits(repoPath, lastHash)

      if (commits.length === 0) continue

      // Track the latest hash
      agentLastHash.set(agentId, commits[0].hash)

      const fileSet = agentFiles.get(agentId)!
      for (const commit of commits) {
        for (const file of commit.files) fileSet.add(file)

        send<AgentCommitEvent>('orcv2:agent-commit', {
          orchestratorId,
          agentId,
          hash: commit.hash,
          message: commit.message,
          filesChanged: commit.files,
          timestamp: Date.now(),
        })
      }
    }

    // Check for file conflicts
    const conflicts = detectConflicts(agentFiles)
    for (const { agentA, agentB, files } of conflicts) {
      const repoA = agentRepos.get(agentA)!
      const repoB = agentRepos.get(agentB)!

      // The agent that started later (higher index) should rebase onto the earlier one
      send<ConflictDetectedEvent>('orcv2:conflict-detected', {
        orchestratorId,
        targetAgentId: agentB,
        sourceAgentId: agentA,
        conflictingFiles: files,
        instruction: `Conflicting files detected: ${files.join(', ')}. Agent working on branch "${repoA.branch}" has changes that overlap. You should fetch and rebase onto their branch when ready.`,
      })
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
    // ignore stderr noise
  })

  proc.on('close', (code) => {
    if (lineBuf.trim()) processLine(lineBuf)

    if (hasError) return

    if (code !== 0 && !isDone) {
      sendStatus('error', `Claude exited with code ${code}`)
      activeRuns.delete(orchestratorId)
      return
    }

    // Final spawn attempt
    trySpawnAgents()

    if (spawnedCount === 0) {
      const agents = parseAgentResponseV2(fullText)
      if (typeof agents === 'string') {
        sendStatus('error', agents)
        activeRuns.delete(orchestratorId)
        return
      }
      // Fallback spawning
      sendStatus('cloning', 'Cloning repos…')
      agents.forEach((agent, idx) => {
        const branch = agent.branch || `feat/agent-${idx}`
        let repoPath: string
        try {
          repoPath = cloneRepo(payload.workspacePath, branch, idx, orchestratorId)
          run.clonePaths.push(repoPath)
        } catch (err) {
          sendStatus('error', `Clone failed: ${(err as Error).message}`)
          return
        }

        const agentId = `orcv2-agent-${orchestratorId}-${idx}`
        const agentX = payload.worldX + ORCHESTRATOR_W + 80
        const agentY = payload.worldY + idx * (AGENT_NODE_H + AGENT_NODE_GAP)

        agentRepos.set(agentId, { repoPath, branch, agentId })
        agentFiles.set(agentId, new Set())

        send<RepoAgentSpawnedEvent>('orcv2:agent-spawned', {
          orchestratorId,
          agentId,
          title: (agent.title ?? `Agent ${idx + 1}`).slice(0, 40),
          task: agent.task ?? '',
          branch,
          repoPath,
          colorIndex: idx,
          worldX: agentX,
          worldY: agentY,
        })
      })
      spawnedCount = agents.length
    }

    if (spawnedCount > 0) {
      sendStatus('monitoring', `Monitoring ${spawnedCount} agent${spawnedCount !== 1 ? 's' : ''} — polling commits`)

      // Start polling for commits every 5 seconds
      run.pollTimer = setInterval(pollCommits, 5_000)
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
 * Merge all agent branches back into the source repo's current branch.
 * Merges in order (agent-0 first, agent-1 second, etc.) to maintain priority.
 */
export function mergeAgentBranches(
  orchestratorId: string,
  webContents: WebContents,
  sourceRepoPath: string,
): void {
  const run = activeRuns.get(orchestratorId)
  if (!run) return

  const send = <T>(channel: string, data: T): void => {
    if (!webContents.isDestroyed()) webContents.send(channel, data)
  }

  const sendStatus = (status: OrcV2StatusEvent['status'], message?: string): void => {
    send<OrcV2StatusEvent>('orcv2:status', { orchestratorId, status, message })
  }

  sendStatus('merging', 'Merging agent branches…')

  // Get the original branch name
  let originalBranch: string
  try {
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: sourceRepoPath,
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim()
  } catch {
    sendStatus('error', 'Could not determine current branch of source repo')
    return
  }

  for (let i = 0; i < run.clonePaths.length; i++) {
    const clonePath = run.clonePaths[i]
    const agentId = `orcv2-agent-${orchestratorId}-${i}`

    let branch: string
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: clonePath,
        encoding: 'utf-8',
        timeout: 5_000,
      }).trim()
    } catch {
      send<MergeProgressEvent>('orcv2:merge-progress', {
        orchestratorId,
        agentId,
        branch: 'unknown',
        status: 'conflict',
        message: 'Could not read branch',
      })
      continue
    }

    send<MergeProgressEvent>('orcv2:merge-progress', {
      orchestratorId,
      agentId,
      branch,
      status: 'merging',
    })

    try {
      // Fetch the agent's branch into the source repo
      execSync(`git fetch "${clonePath}" "${branch}:orcv2/${branch}"`, {
        cwd: sourceRepoPath,
        stdio: 'pipe',
        timeout: 15_000,
      })

      // Merge into the original branch
      execSync(`git merge "orcv2/${branch}" --no-edit -m "Merge ${branch} from orchestrator v2"`, {
        cwd: sourceRepoPath,
        stdio: 'pipe',
        timeout: 15_000,
      })

      send<MergeProgressEvent>('orcv2:merge-progress', {
        orchestratorId,
        agentId,
        branch,
        status: 'merged',
      })
    } catch (err) {
      // Abort the merge if it failed
      try {
        execSync('git merge --abort', { cwd: sourceRepoPath, stdio: 'pipe', timeout: 5_000 })
      } catch {
        // already clean
      }

      send<MergeProgressEvent>('orcv2:merge-progress', {
        orchestratorId,
        agentId,
        branch,
        status: 'conflict',
        message: (err as Error).message,
      })
    }
  }

  sendStatus('done', 'All branches processed')
}

export function cancelOrchestratorV2(orchestratorId: string): void {
  const run = activeRuns.get(orchestratorId)
  if (!run) return

  run.proc.kill()
  if (run.pollTimer) clearInterval(run.pollTimer)

  // Cleanup temp clones
  for (const clonePath of run.clonePaths) {
    try {
      rmSync(clonePath, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }

  activeRuns.delete(orchestratorId)
}

export function cleanupOrchestratorV2(orchestratorId: string): void {
  const run = activeRuns.get(orchestratorId)
  if (!run) return

  if (run.pollTimer) clearInterval(run.pollTimer)

  for (const clonePath of run.clonePaths) {
    try {
      rmSync(clonePath, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }

  activeRuns.delete(orchestratorId)
}

// ---------------------------------------------------------------------------
// JSON parsing helpers (same approach as v1 but with branch field)
// ---------------------------------------------------------------------------

function parseAgentsFromPartialText(text: string): RepoAgentDef[] {
  const agents: RepoAgentDef[] = []

  // Match objects with title, task, and branch fields in any order
  const regex = /\{[^{}]*"title"\s*:\s*"([^"]*)"[^{}]*"task"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[^{}]*(?:"branch"\s*:\s*"([^"]*)")?[^{}]*\}/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const title = match[1]
    let task = match[2]
    const branch = match[3] || `feat/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`
    try {
      task = JSON.parse(`"${task}"`)
    } catch {
      // use as-is
    }
    if (title || task) {
      agents.push({ title, task, branch })
    }
  }

  return agents
}

function parseAgentResponseV2(raw: string): RepoAgentDef[] | string {
  let text = raw

  try {
    const envelope = JSON.parse(text) as { result?: string; is_error?: boolean }
    if (envelope.is_error) return envelope.result ?? 'Claude returned an error'
    if (envelope.result) text = envelope.result
  } catch {
    // not envelope
  }

  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
    return `Could not find task list in response:\n${preview}`
  }

  try {
    const agents = JSON.parse(match[0]) as RepoAgentDef[]
    if (!Array.isArray(agents)) return 'Response was not an array'
    return agents.filter((a) => a && (a.task || a.title))
  } catch (e) {
    const preview = match[0].length > 200 ? match[0].slice(0, 200) + '…' : match[0]
    return `Invalid JSON: ${(e as Error).message}\n${preview}`
  }
}
