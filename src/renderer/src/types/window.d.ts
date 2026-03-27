import type { AgentSignal, AgentFileChange } from '../../../modules/servers/agentic_signals/shared/types'
import type {
  OrchestratorStartPayload,
  SubagentSpawnedEvent,
  OrchestratorStatusEvent,
  NoteUpdateEvent,
} from '../../../plugins/orchestrator/shared/types'

// Global window API types exposed via contextBridge

interface BrowserSessionRow {
  id: string
  name: string
  createdAt: number
}

interface NodeMetadataRow {
  nodeId: string
  lastFocusedAt: number
  focusCount: number
  totalFocusDuration: number
  tags: string // JSON array string
  description: string | null
  pinned: number // 0 | 1
}

interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
  description: string | null
}

interface NodeRow {
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

interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}

interface BrowserCaptureAndHideResult {
  dataUrl: string | null
  didHide: boolean
}

declare global {
  interface Window {
    mcp: {
      getTools: () => Promise<unknown[]>
      execute: (name: string, input: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>
      onAction: (cb: (msg: { id: number; action: string; params: Record<string, unknown> }) => void) => () => void
      respond: (id: number, result: unknown) => void
    }

    terminal: {
      create: (id: string, workspaceId: string, cwd: string, shell: string) => Promise<void>
      write: (id: string, data: string) => void
      resize: (id: string, cols: number, rows: number) => void
      kill: (id: string, workspaceId: string, deleteSession: boolean) => Promise<void>
      saveState: (nodeId: string, serializedState: string) => Promise<void>
      onData: (id: string, cb: (data: string) => void) => () => void
    }

    workspace: {
      homedir: () => Promise<string>
      openDialog: () => Promise<string | null>
      getAll: () => Promise<WorkspaceRow[]>
      save: (w: WorkspaceRow) => Promise<void>
      delete: (id: string) => Promise<void>
    }

    canvas: {
      getNodes: (workspaceId: string) => Promise<NodeRow[]>
      saveNodes: (workspaceId: string, nodes: NodeRow[]) => Promise<void>
      saveNodesSync: (workspaceId: string, nodes: NodeRow[]) => void
      deleteNode: (id: string) => Promise<void>
      getCamera: (workspaceId: string) => Promise<CameraRow | null>
      saveCamera: (cam: CameraRow) => Promise<void>
    }

    appState: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
    }

    agent: {
      getMetadata: (nodeIds: string[]) => Promise<NodeMetadataRow[]>
      saveMetadata: (nodeId: string, patch: Partial<Omit<NodeMetadataRow, 'nodeId'>>) => Promise<void>
      onStatus: (cb: (signal: AgentSignal) => void) => () => void
      onFileChange: (cb: (event: AgentFileChange & { orchestratorId: string }) => void) => () => void
    }

    app: {
      onShortcut: (cb: (name: string) => void) => () => void
      notionPreloadPath: () => Promise<string>
      trelloPreloadPath: () => Promise<string>
      canvasWebviewPreloadPath: () => Promise<string>
      getCursorPos: () => Promise<{ x: number; y: number }>
      openExternal: (url: string) => Promise<void>
    }

    voice: {
      checkHandy: () => Promise<boolean>
      installHandy: () => Promise<void>
      setup: () => Promise<{ bridgeScriptPath: string }>
      toggle: () => Promise<void>
      onTranscript: (cb: (text: string) => void) => () => void
      runAgent: (transcript: string) => Promise<string | null>
      onAgentStatus: (cb: (status: { state: string; message?: string }) => void) => () => void
    }

    orchestrator: {
      start: (orchestratorId: string, payload: OrchestratorStartPayload) => Promise<{ ok: boolean }>
      cancel: (orchestratorId: string) => Promise<void>
      registerNode: (nodeId: string, orchestratorId: string) => Promise<void>
      onNodeCreated: (cb: (event: SubagentSpawnedEvent) => void) => () => void
      onStatus: (cb: (event: OrchestratorStatusEvent) => void) => () => void
      onNoteUpdate: (cb: (event: NoteUpdateEvent) => void) => () => void
    }

    lovable: {
      preloadPath: () => Promise<string>
      reportStatus: (nodeId: string, status: { loggedIn: boolean; url: string }) => Promise<void>
      onInjectPrompt: (cb: (nodeId: string | null, prompt: string) => void) => () => void
      createSessionDir: () => Promise<string>
      checkMcpGlobal: () => Promise<boolean>
      installMcpGlobal: () => Promise<void>
    }

    windowpicker: {
      listWindows: () => Promise<Array<{ id: number; name: string; owner: string; pid: number }>>
      getThumbnails: () => Promise<Array<{ id: number; thumbnail: string }>>
      captureWindow: (windowId: number) => Promise<string | null>
      focusWindow: (pid: number, owner: string) => Promise<void>
    }

    notion: {
      fetchImage: (partition: string, imageUrl: string, blockId?: string) => Promise<string>
      fetchPage: (partition: string, pageId: string) => Promise<{
        recordMap: {
          block: Record<string, { value: {
            id: string
            type: string
            properties?: Record<string, any[][]>
            content?: string[]
          }}>
        }
      }>
      prepareExternalDrag: (
        partition: string,
        pageId: string,
        title: string,
        pageUrl?: string
      ) => Promise<{
        title: string
        text: string
        html: string
        markdown: string
        filename: string
        filePath: string
        fileUrl: string
        pageUrl: string
      }>
    }

    trello: {
      fetchCard: (apiKey: string, token: string, cardId: string) => Promise<{
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
      }>
      fetchCardWithSession: (partition: string, cardId: string) => Promise<{
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
      }>
      prepareExport: (apiKey: string, token: string, cardId: string) => Promise<{ text: string; markdown: string }>
    }

    sessions: {
      getAll: () => Promise<BrowserSessionRow[]>
      save: (s: BrowserSessionRow) => Promise<void>
      delete: (id: string) => Promise<void>
      login: (partition: string, url: string) => Promise<void>
    }

    browser: {
      create: (nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      destroy: (nodeId: string) => Promise<void>
      changeSession: (nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      setCanvasLeft: (left: number) => void
      setCanvasActive: (active: boolean) => void
      updateBounds: (nodeId: string, bounds: { x: number; y: number; width: number; height: number }) => void
      setVisible: (nodeId: string, visible: boolean) => void
      setZoomFactor: (nodeId: string, factor: number) => void
      navigate: (nodeId: string, url: string) => void
      back: (nodeId: string) => void
      forward: (nodeId: string) => void
      reload: (nodeId: string) => void
      stop: (nodeId: string) => void
      focus: (nodeId: string) => void
      capture: (nodeId: string) => Promise<string | null>
      captureAndHide: (nodeId: string) => Promise<BrowserCaptureAndHideResult>
      executeJS: (nodeId: string, js: string) => Promise<unknown>
      onEvent: (cb: (nodeId: string, event: string, data: Record<string, unknown>) => void) => () => void
      onCanvasEvent: (cb: (nodeId: string, channel: string, data: Record<string, unknown>) => void) => () => void
    }

    git: {
      clone: (repoUrl: string, targetDir: string) => Promise<void>
      isRepo: (rootPath: string) => Promise<boolean>
      status: (rootPath: string) => Promise<{
        branch: string; ahead: number; behind: number
        files: Array<{ path: string; index: string; working: string }>
      }>
      fileAtHead: (rootPath: string, filePath: string) => Promise<string | null>
      diff: (rootPath: string, filePath: string, staged: boolean) => Promise<string>
      stage: (rootPath: string, filePaths: string[]) => Promise<void>
      unstage: (rootPath: string, filePaths: string[]) => Promise<void>
      commit: (rootPath: string, message: string) => Promise<void>
      log: (rootPath: string, maxCount?: number) => Promise<Array<{ hash: string; date: string; message: string; author: string }>>
      logGraph: (rootPath: string, maxCount?: number) => Promise<Array<{ hash: string; fullHash: string; parents: string[]; author: string; subject: string; refs: string }>>
      discard: (rootPath: string, filePaths: string[]) => Promise<void>
      branches: (rootPath: string) => Promise<Array<{ name: string; author: string; subject: string; timeAgo: string; isCurrent: boolean }>>
      checkoutBranch: (rootPath: string, name: string, createNew: boolean) => Promise<void>
      push: (rootPath: string) => Promise<{ error?: string }>
      remoteUrl: (rootPath: string) => Promise<string | null>
      worktreeAdd: (rootPath: string, branchName: string, baseBranch?: string) => Promise<string>
      worktreeRemove: (rootPath: string, worktreePath: string) => Promise<void>
      worktreeList: (rootPath: string) => Promise<Array<{ path: string; head: string; branch: string }>>
      checkMergeConflicts: (rootPath: string, branchName: string, targetBranch?: string) => Promise<{ hasConflicts: boolean; conflictingFiles: string[] }>
      checkAllWorktreeConflicts: (rootPath: string, targetBranch?: string) => Promise<Record<string, string[]>>
    }

    fs: {
      readDir: (dirPath: string) => Promise<Array<{
        name: string
        isDir: boolean
        size: number
        modified: number
      }>>
      openFile: (filePath: string) => Promise<void>
      readFile: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string) => Promise<void>
      delete: (filePath: string) => Promise<void>
    }
  }
}

export {}
