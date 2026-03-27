export interface CoordinatorStartPayload {
  task: string
  markdown: string
  /** ID of the original kanban card being planned */
  cardId: string
  /** Workspace ID for the kanban store */
  workspaceId: string
  workspacePath?: string
}

export interface CoordinatorTaskDef {
  title: string
  description: string
  /** Execution order (lower = earlier) */
  order: number
  /** Indices of tasks this depends on (0-based, referencing position in the array) */
  dependsOnIndices: number[]
  /** Relevant files to read/modify */
  files?: string[]
}

export interface CoordinatorResultEvent {
  coordinatorId: string
  status: 'thinking' | 'streaming' | 'done' | 'too_small' | 'error'
  message?: string
  streamText?: string
  /** Final parsed tasks — only present when status is 'done' */
  tasks?: CoordinatorTaskDef[]
}
