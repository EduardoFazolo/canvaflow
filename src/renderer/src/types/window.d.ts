// Global window API types exposed via contextBridge

interface BrowserSessionRow {
  id: string
  name: string
  createdAt: number
}

interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
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

declare global {
  interface Window {
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

    maestro: {
      updateCursor: (data: {
        visible: boolean
        x: number
        y: number
        mode: 'idle' | 'panning' | 'zooming' | 'prayer'
        hovering: boolean
        dwellProgress: number
        ramp: number
      }) => void
    }

    app: {
      onShortcut: (cb: (name: string) => void) => () => void
      notionPreloadPath: () => Promise<string>
      trelloPreloadPath: () => Promise<string>
      canvasWebviewPreloadPath: () => Promise<string>
      getCursorPos: () => Promise<{ x: number; y: number }>
    }

    lovable: {
      preloadPath: () => Promise<string>
      reportStatus: (nodeId: string, status: { loggedIn: boolean; url: string }) => Promise<void>
      onInjectPrompt: (cb: (nodeId: string | null, prompt: string) => void) => () => void
      createSessionDir: () => Promise<string>
      checkMcpGlobal: () => Promise<boolean>
      installMcpGlobal: () => Promise<void>
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
