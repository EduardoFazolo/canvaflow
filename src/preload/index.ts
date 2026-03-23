import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSignal } from '../modules/servers/agentic_signals/shared/types'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
  OrchestratorStreamEvent,
  NoteUpdateEvent,
} from '../plugins/orchestrator/shared/types'

interface NodeMetadataRow { nodeId: string; lastFocusedAt: number; focusCount: number; tags: string }

contextBridge.exposeInMainWorld('terminal', {
  create: (id: string, workspaceId: string, cwd: string, shell: string) =>
    ipcRenderer.invoke('terminal:create', id, workspaceId, cwd, shell),

  write: (id: string, data: string) =>
    ipcRenderer.send('terminal:write', id, data),

  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),

  // deleteSession=true when the node is explicitly closed; false on workspace switch / app quit
  kill: (id: string, workspaceId: string, deleteSession: boolean) =>
    ipcRenderer.invoke('terminal:kill', id, workspaceId, deleteSession),

  saveState: (nodeId: string, serializedState: string) =>
    ipcRenderer.invoke('terminal:saveState', nodeId, serializedState),

  onData: (id: string, callback: (data: string) => void) => {
    const listener = (_event: unknown, termId: string, data: string) => {
      if (termId === id) callback(data)
    }
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
})

contextBridge.exposeInMainWorld('workspace', {
  homedir: (): Promise<string> =>
    ipcRenderer.invoke('workspace:homedir'),

  openDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('workspace:openDialog'),

  getAll: (): Promise<WorkspaceRow[]> =>
    ipcRenderer.invoke('workspace:getAll'),

  save: (w: WorkspaceRow): Promise<void> =>
    ipcRenderer.invoke('workspace:save', w),

  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('workspace:delete', id),
})

contextBridge.exposeInMainWorld('canvas', {
  getNodes: (workspaceId: string): Promise<NodeRow[]> =>
    ipcRenderer.invoke('canvas:getNodes', workspaceId),

  saveNodes: (workspaceId: string, nodes: NodeRow[]): Promise<void> =>
    ipcRenderer.invoke('canvas:saveNodes', workspaceId, nodes),

  // Synchronous variant for beforeunload — blocks until SQLite write completes
  saveNodesSync: (workspaceId: string, nodes: NodeRow[]): void =>
    ipcRenderer.sendSync('canvas:saveNodesSync', workspaceId, nodes),

  deleteNode: (id: string): Promise<void> =>
    ipcRenderer.invoke('canvas:deleteNode', id),

  getCamera: (workspaceId: string): Promise<CameraRow | null> =>
    ipcRenderer.invoke('canvas:getCamera', workspaceId),

  saveCamera: (cam: CameraRow): Promise<void> =>
    ipcRenderer.invoke('canvas:saveCamera', cam),
})

contextBridge.exposeInMainWorld('appState', {
  get: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('app:getState', key),

  set: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('app:setState', key, value),
})

contextBridge.exposeInMainWorld('sessions', {
  getAll: (): Promise<BrowserSessionRow[]> =>
    ipcRenderer.invoke('sessions:getAll'),

  save: (s: BrowserSessionRow): Promise<void> =>
    ipcRenderer.invoke('sessions:save', s),

  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('sessions:delete', id),

  login: (partition: string, url: string): Promise<void> =>
    ipcRenderer.invoke('session:openLoginWindow', partition, url),
})

contextBridge.exposeInMainWorld('git', {
  clone: (repoUrl: string, targetDir: string): Promise<void> =>
    ipcRenderer.invoke('git:clone', repoUrl, targetDir),
  isRepo: (rootPath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:isRepo', rootPath),
  status: (rootPath: string): Promise<GitStatusResult> =>
    ipcRenderer.invoke('git:status', rootPath),
  fileAtHead: (rootPath: string, filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('git:fileAtHead', rootPath, filePath),
  diff: (rootPath: string, filePath: string, staged: boolean): Promise<string> =>
    ipcRenderer.invoke('git:diff', rootPath, filePath, staged),
  stage: (rootPath: string, filePaths: string[]): Promise<void> =>
    ipcRenderer.invoke('git:stage', rootPath, filePaths),
  unstage: (rootPath: string, filePaths: string[]): Promise<void> =>
    ipcRenderer.invoke('git:unstage', rootPath, filePaths),
  commit: (rootPath: string, message: string): Promise<void> =>
    ipcRenderer.invoke('git:commit', rootPath, message),
  log: (rootPath: string, maxCount?: number): Promise<GitLogEntry[]> =>
    ipcRenderer.invoke('git:log', rootPath, maxCount),
  logGraph: (rootPath: string, maxCount?: number): Promise<GitGraphEntry[]> =>
    ipcRenderer.invoke('git:logGraph', rootPath, maxCount),
  discard: (rootPath: string, filePaths: string[]): Promise<void> =>
    ipcRenderer.invoke('git:discard', rootPath, filePaths),

  push: (rootPath: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke('git:push', rootPath),
  branches: (rootPath: string): Promise<GitBranchEntry[]> =>
    ipcRenderer.invoke('git:branches', rootPath),
  checkoutBranch: (rootPath: string, name: string, createNew: boolean): Promise<void> =>
    ipcRenderer.invoke('git:checkoutBranch', rootPath, name, createNew),
})

contextBridge.exposeInMainWorld('fs', {
  readDir: (dirPath: string): Promise<FsEntry[]> =>
    ipcRenderer.invoke('fs:readDir', dirPath),

  openFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:openFile', filePath),

  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  delete: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete', filePath),
})

contextBridge.exposeInMainWorld('agent', {
  getMetadata: (nodeIds: string[]): Promise<NodeMetadataRow[]> =>
    ipcRenderer.invoke('agent:getMetadata', nodeIds),

  saveMetadata: (nodeId: string, patch: Partial<Omit<NodeMetadataRow, 'nodeId'>>): Promise<void> =>
    ipcRenderer.invoke('agent:saveMetadata', nodeId, patch),

  onStatus: (cb: (signal: AgentSignal) => void): (() => void) => {
    const listener = (_: unknown, signal: AgentSignal) => cb(signal)
    ipcRenderer.on('agent:status', listener)
    return () => ipcRenderer.removeListener('agent:status', listener)
  },
})

contextBridge.exposeInMainWorld('app', {
  onShortcut: (cb: (name: string) => void) => {
    const listener = (_: unknown, name: string) => cb(name)
    ipcRenderer.on('shortcut', listener)
    return () => ipcRenderer.removeListener('shortcut', listener)
  },
  notionPreloadPath: (): Promise<string> =>
    ipcRenderer.invoke('app:notionPreloadPath'),
  trelloPreloadPath: (): Promise<string> =>
    ipcRenderer.invoke('app:trelloPreloadPath'),
  canvasWebviewPreloadPath: (): Promise<string> =>
    ipcRenderer.invoke('app:canvasWebviewPreloadPath'),
  getCursorPos: (): Promise<{ x: number; y: number }> =>
    ipcRenderer.invoke('app:getCursorPos'),
})

contextBridge.exposeInMainWorld('browser', {
  create: (nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('browser:create', nodeId, partition, url, bounds),
  destroy: (nodeId: string): Promise<void> =>
    ipcRenderer.invoke('browser:destroy', nodeId),
  changeSession: (nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('browser:change-session', nodeId, partition, url, bounds),
  setCanvasLeft: (left: number): void =>
    ipcRenderer.send('browser:set-canvas-left', left),
  setCanvasActive: (active: boolean): void =>
    ipcRenderer.send('browser:set-canvas-active', active),
  updateBounds: (nodeId: string, bounds: { x: number; y: number; width: number; height: number }): void =>
    ipcRenderer.send('browser:update-bounds', nodeId, bounds),
  setVisible: (nodeId: string, visible: boolean): void =>
    ipcRenderer.send('browser:set-visible', nodeId, visible),
  setZoomFactor: (nodeId: string, factor: number): void =>
    ipcRenderer.send('browser:set-zoom-factor', nodeId, factor),
  navigate: (nodeId: string, url: string): void =>
    ipcRenderer.send('browser:navigate', nodeId, url),
  back: (nodeId: string): void => ipcRenderer.send('browser:back', nodeId),
  forward: (nodeId: string): void => ipcRenderer.send('browser:forward', nodeId),
  reload: (nodeId: string): void => ipcRenderer.send('browser:reload', nodeId),
  stop: (nodeId: string): void => ipcRenderer.send('browser:stop', nodeId),
  focus: (nodeId: string): void => ipcRenderer.send('browser:focus', nodeId),
  capture: (nodeId: string): Promise<string | null> =>
    ipcRenderer.invoke('browser:capture', nodeId),
  captureAndHide: (nodeId: string): Promise<{ dataUrl: string | null; didHide: boolean }> =>
    ipcRenderer.invoke('browser:capture-and-hide', nodeId),
  executeJS: (nodeId: string, js: string): Promise<unknown> =>
    ipcRenderer.invoke('browser:execute-js', nodeId, js),
  onEvent: (callback: (nodeId: string, event: string, data: Record<string, unknown>) => void): () => void => {
    const listener = (_: unknown, nodeId: string, event: string, data: Record<string, unknown>) => callback(nodeId, event, data)
    ipcRenderer.on('browser:event', listener)
    return () => ipcRenderer.removeListener('browser:event', listener)
  },
  onCanvasEvent: (callback: (nodeId: string, channel: string, data: Record<string, unknown>) => void): () => void => {
    const listener = (_: unknown, nodeId: string, channel: string, data: Record<string, unknown>) => callback(nodeId, channel, data)
    ipcRenderer.on('browser:canvas-event', listener)
    return () => ipcRenderer.removeListener('browser:canvas-event', listener)
  },
})

contextBridge.exposeInMainWorld('trello', {
  fetchCard: (apiKey: string, token: string, cardId: string): Promise<TrelloCard> =>
    ipcRenderer.invoke('trello:fetchCard', apiKey, token, cardId),
  fetchCardWithSession: (partition: string, cardId: string): Promise<TrelloCard> =>
    ipcRenderer.invoke('trello:fetchCardWithSession', partition, cardId),
  prepareExport: (apiKey: string, token: string, cardId: string): Promise<{ text: string; markdown: string }> =>
    ipcRenderer.invoke('trello:prepareExport', apiKey, token, cardId),
})

contextBridge.exposeInMainWorld('lovable', {
  preloadPath: (): Promise<string> =>
    ipcRenderer.invoke('lovable:preload-path'),

  reportStatus: (nodeId: string, status: { loggedIn: boolean; url: string }): Promise<void> =>
    ipcRenderer.invoke('lovable:report-status', nodeId, status),

  createSessionDir: (): Promise<string> =>
    ipcRenderer.invoke('lovable:create-session-dir'),

  onInjectPrompt: (callback: (nodeId: string | null, prompt: string) => void): () => void => {
    const listener = (_: unknown, nodeId: string | null, prompt: string) => callback(nodeId, prompt)
    ipcRenderer.on('lovable:inject-prompt', listener)
    return () => ipcRenderer.removeListener('lovable:inject-prompt', listener)
  },

  checkMcpGlobal: (): Promise<boolean> =>
    ipcRenderer.invoke('lovable:check-mcp-global'),

  installMcpGlobal: (): Promise<void> =>
    ipcRenderer.invoke('lovable:install-mcp-global'),
})

contextBridge.exposeInMainWorld('orchestrator', {
  start: (orchestratorId: string, payload: OrchestratorStartPayload): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('orchestrator:start', orchestratorId, payload),

  cancel: (orchestratorId: string): Promise<void> =>
    ipcRenderer.invoke('orchestrator:cancel', orchestratorId),

  onNodeCreated: (cb: (event: SubagentSpawnedEvent) => void): (() => void) => {
    const listener = (_: unknown, event: SubagentSpawnedEvent) => cb(event)
    ipcRenderer.on('orchestrator:node-created', listener)
    return () => ipcRenderer.removeListener('orchestrator:node-created', listener)
  },

  onStatus: (cb: (event: OrchestratorStatusEvent) => void): (() => void) => {
    const listener = (_: unknown, event: OrchestratorStatusEvent) => cb(event)
    ipcRenderer.on('orchestrator:status', listener)
    return () => ipcRenderer.removeListener('orchestrator:status', listener)
  },

  onNoteUpdate: (cb: (event: NoteUpdateEvent) => void): (() => void) => {
    const listener = (_: unknown, event: NoteUpdateEvent) => cb(event)
    ipcRenderer.on('orchestrator:note-update', listener)
    return () => ipcRenderer.removeListener('orchestrator:note-update', listener)
  },

  onStream: (cb: (event: OrchestratorStreamEvent) => void): (() => void) => {
    const listener = (_: unknown, event: OrchestratorStreamEvent) => cb(event)
    ipcRenderer.on('orchestrator:stream', listener)
    return () => ipcRenderer.removeListener('orchestrator:stream', listener)
  },
})

contextBridge.exposeInMainWorld('notion', {
  fetchPage: (partition: string, pageId: string): Promise<NotionPageChunk> =>
    ipcRenderer.invoke('notion:fetchPage', partition, pageId),
  fetchImage: (partition: string, imageUrl: string, blockId?: string): Promise<string> =>
    ipcRenderer.invoke('notion:fetchImage', partition, imageUrl, blockId),
  prepareExternalDrag: (partition: string, pageId: string, title: string, pageUrl?: string): Promise<NotionExternalDragExport> =>
    ipcRenderer.invoke('notion:prepareExternalDrag', partition, pageId, title, pageUrl),
})

// ---------------------------------------------------------------------------
// Shared types (used in preload — renderer accesses via window.*)
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
}

export interface NodeRow {
  id: string
  workspaceId: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: number
  props: string
  createdAt: number
  updatedAt: number
}

export interface FsEntry {
  name: string
  isDir: boolean
  size: number
  modified: number
}

export interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}

export interface BrowserSessionRow {
  id: string
  name: string
  createdAt: number
}

export interface TrelloCard {
  id: string
  name: string
  desc: string
  shortLink: string
  url: string
  labels: Array<{ id: string; name: string; color: string }>
  checklists: Array<{
    id: string
    name: string
    checkItems: Array<{ id: string; name: string; state: 'complete' | 'incomplete' }>
  }>
  due: string | null
}

export interface NotionPageChunk {
  recordMap: {
    block: Record<string, { value: NotionBlock }>
  }
}

export interface NotionBlock {
  id: string
  type: string
  properties?: Record<string, NotionRichText[][]>
  content?: string[]
  parent_id?: string
}

export type NotionRichText = string | string[][]

export interface NotionExternalDragExport {
  title: string
  text: string
  html: string
  markdown: string
  filename: string
  filePath: string
  fileUrl: string
  pageUrl: string
}

export interface GitFileStatus {
  path: string
  index: string
  working: string
}

export interface GitStatusResult {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
}

export interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}

export interface GitBranchEntry {
  name: string
  author: string
  subject: string
  timeAgo: string
  isCurrent: boolean
}

export interface GitGraphEntry {
  hash: string
  fullHash: string
  parents: string[]
  author: string
  subject: string
  refs: string
}
