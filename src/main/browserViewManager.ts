import { BrowserWindow, WebContentsView, session, ipcMain } from 'electron'
import { join } from 'path'
import { setupBrowserSession } from './browserSession'

interface ViewEntry {
  view: WebContentsView
  partition: string
}

const views = new Map<string, ViewEntry>()

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/canvasWebview.js')
}

function makeSession(partition: string) {
  const ses = session.fromPartition(partition)
  setupBrowserSession(ses)
  return ses
}

function attachListeners(nodeId: string, view: WebContentsView): void {
  const wc = view.webContents

  wc.on('did-start-loading', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-start-loading', {})
  })

  wc.on('did-stop-loading', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-stop-loading', { url: wc.getURL() })
  })

  wc.on('did-navigate', (_e, url) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-navigate', { url })
  })

  wc.on('did-navigate-in-page', (_e, url) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'did-navigate-in-page', { url })
  })

  wc.on('page-title-updated', (_e, title) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'page-title-updated', { title })
  })

  wc.on('did-fail-load', (_e, errorCode) => {
    if (errorCode !== -3) {
      getMainWindow()?.webContents.send('browser:event', nodeId, 'did-fail-load', {})
    }
  })

  wc.on('focus', () => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'focus', {})
  })

  wc.setWindowOpenHandler((details) => {
    getMainWindow()?.webContents.send('browser:event', nodeId, 'new-window', { url: details.url })
    return { action: 'deny' }
  })
}

export function createBrowserView(
  nodeId: string,
  partition: string,
  url: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  destroyBrowserView(nodeId)

  const win = getMainWindow()
  if (!win) return

  const ses = makeSession(partition)
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--canvaflow-node-id=${nodeId}`],
    },
  })

  views.set(nodeId, { view, partition })
  win.contentView.addChildView(view)
  view.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(Math.max(bounds.width, 1)), height: Math.round(Math.max(bounds.height, 1)) })
  view.setVisible(false)

  attachListeners(nodeId, view)

  if (url) {
    view.webContents.loadURL(url).catch(() => {})
  }
}

export function destroyBrowserView(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  const win = getMainWindow()
  if (win) {
    try { win.contentView.removeChildView(entry.view) } catch {}
  }
  try { entry.view.webContents.close() } catch {}
  views.delete(nodeId)
}

export function changeBrowserViewSession(
  nodeId: string,
  partition: string,
  url: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  createBrowserView(nodeId, partition, url, bounds)
}

export function updateBrowserViewBounds(
  nodeId: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(Math.max(bounds.width, 1)),
    height: Math.round(Math.max(bounds.height, 1)),
  })
}

export function setBrowserViewVisible(nodeId: string, visible: boolean): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.setVisible(visible)
}

export function setBrowserViewZoomFactor(nodeId: string, factor: number): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.webContents.setZoomFactor(Math.max(0.1, factor))
}

export function navigateBrowserView(nodeId: string, url: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  entry.view.webContents.loadURL(url).catch(() => {})
}

export function browserViewBack(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  if (entry.view.webContents.canGoBack()) entry.view.webContents.goBack()
}

export function browserViewForward(nodeId: string): void {
  const entry = views.get(nodeId)
  if (!entry) return
  if (entry.view.webContents.canGoForward()) entry.view.webContents.goForward()
}

export function browserViewReload(nodeId: string): void {
  views.get(nodeId)?.view.webContents.reload()
}

export function browserViewStop(nodeId: string): void {
  views.get(nodeId)?.view.webContents.stop()
}

export function focusBrowserView(nodeId: string): void {
  views.get(nodeId)?.view.webContents.focus()
}

export async function captureBrowserView(nodeId: string): Promise<string | null> {
  const entry = views.get(nodeId)
  if (!entry) return null
  try {
    const img = await entry.view.webContents.capturePage()
    return img.toDataURL()
  } catch {
    return null
  }
}

export async function executeBrowserViewJS(nodeId: string, js: string): Promise<unknown> {
  const entry = views.get(nodeId)
  if (!entry) return null
  return entry.view.webContents.executeJavaScript(js)
}

export function destroyAllBrowserViews(): void {
  for (const nodeId of [...views.keys()]) {
    destroyBrowserView(nodeId)
  }
}

export function setupBrowserViewHandlers(): void {
  ipcMain.handle('browser:create', (_e, nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => {
    createBrowserView(nodeId, partition, url, bounds)
  })

  ipcMain.handle('browser:destroy', (_e, nodeId: string) => {
    destroyBrowserView(nodeId)
  })

  ipcMain.handle('browser:change-session', (_e, nodeId: string, partition: string, url: string, bounds: { x: number; y: number; width: number; height: number }) => {
    changeBrowserViewSession(nodeId, partition, url, bounds)
  })

  ipcMain.on('browser:update-bounds', (_e, nodeId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    updateBrowserViewBounds(nodeId, bounds)
  })

  ipcMain.on('browser:set-visible', (_e, nodeId: string, visible: boolean) => {
    setBrowserViewVisible(nodeId, visible)
  })

  ipcMain.on('browser:set-zoom-factor', (_e, nodeId: string, factor: number) => {
    setBrowserViewZoomFactor(nodeId, factor)
  })

  ipcMain.on('browser:navigate', (_e, nodeId: string, url: string) => {
    navigateBrowserView(nodeId, url)
  })

  ipcMain.on('browser:back', (_e, nodeId: string) => { browserViewBack(nodeId) })
  ipcMain.on('browser:forward', (_e, nodeId: string) => { browserViewForward(nodeId) })
  ipcMain.on('browser:reload', (_e, nodeId: string) => { browserViewReload(nodeId) })
  ipcMain.on('browser:stop', (_e, nodeId: string) => { browserViewStop(nodeId) })
  ipcMain.on('browser:focus', (_e, nodeId: string) => { focusBrowserView(nodeId) })

  ipcMain.handle('browser:capture', (_e, nodeId: string) => captureBrowserView(nodeId))

  ipcMain.handle('browser:execute-js', (_e, nodeId: string, js: string) => executeBrowserViewJS(nodeId, js))

  // Forward canvas events from the WebContentsView preload → main → renderer
  ipcMain.on('browser:canvas-event', (_e, nodeId: string, channel: string, data: unknown) => {
    getMainWindow()?.webContents.send('browser:canvas-event', nodeId, channel, data)
  })
}
