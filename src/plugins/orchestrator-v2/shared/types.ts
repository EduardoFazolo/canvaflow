// ---------------------------------------------------------------------------
// Orchestrator V2 — "clone-based" multi-agent orchestration
// ---------------------------------------------------------------------------

/** Color palette assigned to each repo-agent for visual distinction */
export const AGENT_COLORS = [
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#f472b6', // pink
  '#8b5cf6', // violet
  '#22c55e', // green
  '#ef4444', // red
  '#3b82f6', // blue
  '#e879f9', // fuchsia
] as const

// ---------------------------------------------------------------------------
// IPC payloads
// ---------------------------------------------------------------------------

export interface OrcV2StartPayload {
  task: string
  markdown: string
  worldX: number
  worldY: number
  /** The source repo that will be cloned for each agent */
  workspacePath: string
}

export interface RepoAgentDef {
  title: string
  task: string
  branch: string
}

export interface RepoAgentSpawnedEvent {
  orchestratorId: string
  agentId: string
  title: string
  task: string
  branch: string
  repoPath: string
  colorIndex: number
  worldX: number
  worldY: number
}

export interface OrcV2StatusEvent {
  orchestratorId: string
  status: OrcV2Status
  message?: string
  streamText?: string
}

export type OrcV2Status =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'parsing'
  | 'cloning'
  | 'spawning'
  | 'monitoring'
  | 'merging'
  | 'done'
  | 'error'

// ---------------------------------------------------------------------------
// Commit & conflict tracking (sent from main → renderer)
// ---------------------------------------------------------------------------

export interface AgentCommitEvent {
  orchestratorId: string
  agentId: string
  hash: string
  message: string
  filesChanged: string[]
  timestamp: number
}

export interface ConflictDetectedEvent {
  orchestratorId: string
  /** Agent that needs to rebase */
  targetAgentId: string
  /** Agent whose changes come first */
  sourceAgentId: string
  conflictingFiles: string[]
  instruction: string
}

export interface MergeProgressEvent {
  orchestratorId: string
  agentId: string
  branch: string
  status: 'pending' | 'merging' | 'merged' | 'conflict'
  message?: string
}

export interface OrcV2NoteEvent {
  agentId: string
  note: string
}
