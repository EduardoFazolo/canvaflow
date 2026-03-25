import { app, BrowserWindow, ipcMain, session, Menu, WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { setupPtyHandlers, killAllPtys, cleanupOrphanSessions } from './pty'
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
import { registerOrchestratorV2Handlers } from '../plugins/orchestrator-v2/main/handlers'
import { registerWindowPickerHandlers } from '../plugins/windowpicker/main/handlers'

// Suppress noisy Chromium GPU/Skia internal errors that are benign in webview usage
app.commandLine.appendSwitch('log-level', '3')

let mainWindow: BrowserWindow | null = null

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
    else if (mod && input.shift && input.key === 'E') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newEditor') }
    else if (mod && input.shift && input.key === 'L') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newLovable') }
    else if (mod && input.shift && input.key === 'W') { event.preventDefault(); mainWindow!.webContents.send('shortcut', 'newWindowPicker') }
    else if (mod && input.alt && input.key === 'i') { event.preventDefault(); mainWindow!.webContents.toggleDevTools() }

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
  startAgentSignalServer(() => mainWindow?.webContents ?? null)

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
  { label: app.name, submenu: [{ role: 'quit' }] },
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
]))

app.whenReady().then(async () => {
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
  registerOrchestratorV2Handlers(ipcMain, () => mainWindow?.webContents ?? null)
  registerWindowPickerHandlers(ipcMain)

  // Init tmux and clean up orphan sessions from deleted nodes
  await tmuxManager.init()
  await cleanupOrphanSessions(getAllNodeIds())

  // Set up default browser session
  setupBrowserSession(session.fromPartition('persist:canvaflow-ws-default'))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killAllPtys)

export { mainWindow }
