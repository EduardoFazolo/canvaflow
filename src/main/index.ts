import { app, BrowserWindow, ipcMain, session, Menu, WebContents, shell, clipboard } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { setupPtyHandlers, killAllPtys, cleanupOrphanSessions, startGlobalTerminal, setupGlobalTerminalIpc } from './pty'
import { setupCoordinatorHandlers } from './agentCoordinator'
import { initDatabase, getAllNodeIds } from './database'
import { setupWorkspaceHandlers } from './workspace'
import { startAgentSignalServer } from '../modules/servers/agentic_signals/main/server'
import { setupAgenticSignalTools } from '../modules/servers/agentic_signals/main/setup'
import { tmuxManager } from './tmux'
import { setupBrowserSession } from './browserSession'
import { setupBrowserViewHandlers, destroyAllBrowserViews } from './browserViewManager'
import { registerNotionHandlers } from '../plugins/notion/main/handlers'
import { registerTrelloHandlers } from '../plugins/trello/main/handlers'
import { registerGitHandlers } from '../plugins/monaco/main/gitHandlers'
import { registerLovableHandlers } from '../plugins/lovable/main/handlers'
import { registerOrchestratorHandlers } from '../plugins/orchestrator/main/handlers'
import { killAllOrchestrators } from '../plugins/orchestrator/main/runner'
import { registerWindowPickerHandlers } from '../plugins/windowpicker/main/handlers'
import { startCanvaflowMcpBridge } from '../modules/servers/canvaflow_mcp/main/server'

// Suppress noisy Chromium GPU/Skia internal errors that are benign in webview usage
app.commandLine.appendSwitch('log-level', '3')

let mainWindow: BrowserWindow | null = null

// Kick off the always-on global terminal as early as possible — fires at module load,
// well before app.whenReady resolves, so early boot output is already buffering.
startGlobalTerminal(() => mainWindow?.webContents ?? null)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 11 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false // needed for node-pty in preload
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Prevent macOS Smart Zoom (two-finger double-tap) and pinch gestures from
  // scaling the renderer window. The UI uses fixed-pixel native elements
  // (traffic lights, WebContentsViews) that don't follow CSS zoom, so any
  // renderer-level zoom breaks the layout.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('zoom-changed', (_event, direction) => {
    // Swallow zoom-changed so Chromium doesn't apply a semantic zoom either.
    // Canvas zoom is handled internally via the camera store, not page zoom.
    void direction
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    // Use only meta (Cmd on macOS) so Ctrl+T/B/F/K/etc. pass through to terminals (readline shortcuts)
    const mod = input.meta
    if (mod && input.key === 't') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newTerminal') }
    else if (mod && input.key === 'b') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newBrowser') }
    else if (mod && input.key === 'f') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newFiles') }
    else if (mod && input.key === '0') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'fitAll') }
    else if (mod && input.key === 'k') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'search') }
    else if (mod && (input.key === '=' || input.key === '+')) { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'zoomIn') }
    else if (mod && input.key === '-') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'zoomOut') }
    else if (mod && input.key === ',') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'settings') }
    else if (mod && input.shift && input.key === 'C') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newClaude') }
    else if (mod && input.shift && input.key === 'X') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newCodex') }
    else if (mod && input.shift && input.key === 'E') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newEditor') }
    else if (mod && input.shift && input.key === 'L') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newLovable') }
    else if (mod && input.shift && input.key === 'W') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newWindowPicker') }
    else if (mod && input.alt && input.key.toLowerCase() === 'i') { event.preventDefault(); mainWindow!.webContents.toggleDevTools() }
    else if (mod && input.shift && input.key.toLowerCase() === 'i') { event.preventDefault(); mainWindow!.webContents.toggleDevTools() }
    else if (input.key === 'F12') { event.preventDefault(); mainWindow!.webContents.toggleDevTools() }

  })

  // Kill all PTYs before the webContents is destroyed so onData never fires into a dead window
  mainWindow.on('close', () => {
    destroyAllBrowserViews()
    killAllPtys()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  setupPtyHandlers(() => mainWindow?.webContents ?? null)
  setupCoordinatorHandlers(() => mainWindow?.webContents ?? null)
  startAgentSignalServer(() => mainWindow?.webContents ?? null)
  startCanvaflowMcpBridge(() => mainWindow?.webContents ?? null)

  // Apply session setup to every webview that attaches (covers named sessions too)
  mainWindow.webContents.on('did-attach-webview', (_event, webviewContents: WebContents) => {
    // ERR_ABORTED (-3) fires whenever a navigation is cancelled mid-flight (webview
    // destroyed, redirected, etc.). It is harmless — suppress to keep logs clean.
    webviewContents.on('did-fail-load', (_e, errorCode) => {
      if (errorCode === -3) return
    })

    setupBrowserSession(webviewContents.session)

    // Popup windows (OAuth etc.) inherit the webview's session so cookies are shared
    webviewContents.setWindowOpenHandler((_details) => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 640,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          session: webviewContents.session,
        },
      },
    }))
  })
}

// Minimal application menu that restores native Cmd+C/V/X/A/Z clipboard shortcuts.
// Without this, Electron apps with autoHideMenuBar lose the Edit role bindings.
Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: app.name, submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit', submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View', submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      {
        label: 'Toggle Developer Tools',
        accelerator: 'CmdOrCtrl+Option+I',
        click: () => { mainWindow?.webContents.toggleDevTools() },
      },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Window', submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  },
]))

app.whenReady().then(async () => {
  setupGlobalTerminalIpc()

  try {
    initDatabase()
  } catch (err) {
    console.error('[main] Database init failed, running without persistence:', err)
  }
  setupWorkspaceHandlers()
  setupBrowserViewHandlers()
  setupAgenticSignalTools()
  registerNotionHandlers(ipcMain)
  registerTrelloHandlers(ipcMain)
  registerGitHandlers(ipcMain)
  registerLovableHandlers(ipcMain)
  registerOrchestratorHandlers(ipcMain, () => mainWindow?.webContents ?? null)
  registerWindowPickerHandlers(ipcMain)

  // Init tmux and clean up orphan sessions from deleted nodes
  await tmuxManager.init()
  await cleanupOrphanSessions(getAllNodeIds())

  // Set up default browser session
  setupBrowserSession(session.fromPartition('persist:canvaflow-ws-default'))

  // Terminal context menu — returns the clicked action so the renderer can act on it
  ipcMain.handle('contextMenu:showTerminalMenu', (_event, hasSelection: boolean) => {
    return new Promise<string | null>((resolve) => {
      const menu = Menu.buildFromTemplate([
        { label: 'Copy', enabled: hasSelection, click: () => resolve('copy') },
        { label: 'Paste', click: () => resolve('paste') },
        { type: 'separator' },
        { label: 'Select All', click: () => resolve('selectAll') },
        { label: 'Clear', click: () => resolve('clear') },
      ])
      menu.popup({ callback: () => resolve(null) })
    })
  })

  createWindow()

  // Native right-click context menu with full browser-like options.
  // Only shown when the renderer doesn't prevent the contextmenu event
  // (i.e. right-clicks inside node content like terminals/browsers).
  app.on('web-contents-created', (_event, contents) => {
    contents.on('context-menu', (_e, params) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      // Link options
      if (params.linkURL) {
        items.push(
          { label: 'Open Link', click: () => shell.openExternal(params.linkURL) },
          { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
          { type: 'separator' },
        )
      }

      // Image options
      if (params.mediaType === 'image') {
        items.push(
          { label: 'Open Image in Browser', click: () => shell.openExternal(params.srcURL) },
          { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
          { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
          { type: 'separator' },
        )
      }

      // Video/audio options
      if (params.mediaType === 'video' || params.mediaType === 'audio') {
        items.push(
          { label: 'Open Media in Browser', click: () => shell.openExternal(params.srcURL) },
          { label: 'Copy Media Address', click: () => clipboard.writeText(params.srcURL) },
          { type: 'separator' },
        )
      }

      // Text editing options
      if (params.isEditable) {
        items.push(
          { role: 'undo', enabled: params.editFlags.canUndo },
          { role: 'redo', enabled: params.editFlags.canRedo },
          { type: 'separator' },
        )
      }

      // Standard clipboard actions
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      )

      // Navigation (for webviews)
      if (params.pageURL && params.pageURL !== contents.getURL()) {
        items.push(
          { type: 'separator' },
          { label: 'Back', enabled: contents.canGoBack(), click: () => contents.goBack() },
          { label: 'Forward', enabled: contents.canGoForward(), click: () => contents.goForward() },
          { label: 'Reload', click: () => contents.reload() },
        )
      }

      // Inspect Element (dev tools)
      items.push(
        { type: 'separator' },
        { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) },
      )

      Menu.buildFromTemplate(items).popup()
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Tear down every spawned process tree on quit so MCP servers (claude/codex →
// bun) and orchestrator runs don't linger as orphans after the app closes.
app.on('before-quit', () => {
  killAllPtys()
  killAllOrchestrators()
})

export { mainWindow }
