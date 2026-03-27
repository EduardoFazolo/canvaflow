import { ipcMain, IpcMainEvent, dialog, BrowserWindow, session } from 'electron'
import { homedir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { setupBrowserSession } from './browserSession'
import {
  getWorkspaces, saveWorkspace, deleteWorkspace,
  getNodes, saveNodes, deleteNode,
  getCamera, saveCamera,
  getAppState, setAppState,
  mergeNodeProps,
  getBrowserSessions, saveBrowserSession, deleteBrowserSession,
  getNodeMetadata, upsertNodeMetadata,
  WorkspaceRow, NodeRow, CameraRow, BrowserSessionRow,
} from './database'

export function setupWorkspaceHandlers(): void {
  // -------------------------------------------------------------------------
  // Workspace CRUD
  // -------------------------------------------------------------------------

  ipcMain.handle('workspace:getAll', () => getWorkspaces())

  ipcMain.handle('workspace:save', (_e, w: WorkspaceRow) => saveWorkspace(w))

  ipcMain.handle('workspace:delete', (_e, id: string) => deleteWorkspace(id))

  ipcMain.handle('workspace:homedir', () => homedir())

  ipcMain.handle('workspace:openDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose a workspace directory',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // -------------------------------------------------------------------------
  // Canvas nodes
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getNodes', (_e, workspaceId: string) => getNodes(workspaceId))

  ipcMain.handle('canvas:saveNodes', (_e, workspaceId: string, nodes: NodeRow[]) =>
    saveNodes(workspaceId, nodes)
  )

  // Synchronous variant used in beforeunload to guarantee the write completes before window closes
  ipcMain.on('canvas:saveNodesSync', (event: IpcMainEvent, workspaceId: string, nodes: NodeRow[]) => {
    try { saveNodes(workspaceId, nodes) } catch {}
    event.returnValue = null
  })

  ipcMain.handle('canvas:deleteNode', (_e, id: string) => deleteNode(id))

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  ipcMain.handle('canvas:getCamera', (_e, workspaceId: string) => getCamera(workspaceId))

  ipcMain.handle('canvas:saveCamera', (_e, cam: CameraRow) => saveCamera(cam))

  // -------------------------------------------------------------------------
  // App state
  // -------------------------------------------------------------------------

  ipcMain.handle('app:getState', (_e, key: string) => getAppState(key))

  ipcMain.handle('app:setState', (_e, key: string, value: string) => setAppState(key, value))

  // Synchronous variant for beforeunload — guarantees write completes before window closes
  ipcMain.on('app:setStateSync', (event: IpcMainEvent, key: string, value: string) => {
    try { setAppState(key, value) } catch {}
    event.returnValue = null
  })

  // -------------------------------------------------------------------------
  // Terminal state serialization (xterm scrollback → SQLite)
  // -------------------------------------------------------------------------

  ipcMain.handle('terminal:saveState', (_e, nodeId: string, serializedState: string) =>
    mergeNodeProps(nodeId, { serializedState })
  )

  // -------------------------------------------------------------------------
  // Node metadata (focus tracking, tags)
  // -------------------------------------------------------------------------

  ipcMain.handle('agent:getMetadata', (_e, nodeIds: string[]) => getNodeMetadata(nodeIds))

  ipcMain.handle('agent:saveMetadata', (_e, nodeId: string, patch: Record<string, unknown>) =>
    upsertNodeMetadata(nodeId, patch as any)
  )

  // -------------------------------------------------------------------------
  // Browser sessions
  // -------------------------------------------------------------------------

  ipcMain.handle('sessions:getAll', () => getBrowserSessions())

  ipcMain.handle('sessions:save', (_e, s: BrowserSessionRow) => saveBrowserSession(s))

  ipcMain.handle('sessions:delete', (_e, id: string) => deleteBrowserSession(id))

  // Opens a real BrowserWindow (no webview restrictions) for OAuth/login.
  // The window uses the given partition so cookies land in the right session.
  // Resolves when the user closes the window.
  ipcMain.handle('session:openLoginWindow', async (_e, partition: string, url: string) => {
    const ses = session.fromPartition(partition)
    setupBrowserSession(ses)

    const win = new BrowserWindow({
      width: 1000,
      height: 720,
      autoHideMenuBar: true,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    win.loadURL(url)

    return new Promise<void>((resolve) => {
      win.on('closed', () => resolve())
    })
  })

  // -------------------------------------------------------------------------
  // File system
  // -------------------------------------------------------------------------

  ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name)
        let size = 0
        let modified = 0
        try {
          const stat = await fs.promises.stat(fullPath)
          size = stat.size
          modified = stat.mtimeMs
        } catch {}
        return {
          name: entry.name,
          isDir: entry.isDirectory(),
          size,
          modified,
        }
      })
    )
    // Dirs first, then files, both alphabetical
    return results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  })

  ipcMain.handle('fs:openFile', async (_e, filePath: string) => {
    const { shell } = await import('electron')
    await shell.openPath(filePath)
  })

  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    const { shell } = await import('electron')
    await shell.openExternal(url)
  })

  ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
    return fs.promises.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, 'utf-8')
  })

  ipcMain.handle('fs:delete', async (_e, filePath: string) => {
    await fs.promises.rm(filePath, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------------
  // Git
  // -------------------------------------------------------------------------

  ipcMain.handle('git:clone', (_e, repoUrl: string, targetDir: string) => {
    return new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process')
      const proc = spawn('git', ['clone', repoUrl], { cwd: targetDir })
      let stderr = ''
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', (code: number) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `git clone exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  })

}
