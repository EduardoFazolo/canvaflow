export interface OrchestratorStartPayload {
  task: string
  markdown: string
  worldX: number
  worldY: number
  workspacePath?: string
}

export interface SubagentSpawnedEvent {
  orchestratorId: string
  agentId: string
  title: string
  task: string
  worldX: number
  worldY: number
}

export interface NoteUpdateEvent {
  agentId: string
  note: string
}

export interface OrchestratorStatusEvent {
  orchestratorId: string
  status: 'thinking' | 'done' | 'error'
  message?: string
}

export interface OrchestratorStreamEvent {
  orchestratorId: string
  text: string
}
