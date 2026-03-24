/**
 * CanvaFlow Plugin — Main Process Bundle (optional)
 *
 * This file runs in the Electron main process.
 * It receives a scoped IPC object — all channels are automatically
 * namespaced under `plugin:{{PLUGIN_ID}}:<channel>`.
 *
 * The renderer calls these via:
 *   window.pluginIpc.invoke('{{PLUGIN_ID}}', 'channelName', ...args)
 */

interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown | Promise<unknown>): void
  on(channel: string, listener: (event: unknown, ...args: any[]) => void): void
  removeHandler(channel: string): void
}

export function registerMainHandlers(ipc: IpcMainLike): void {
  ipc.handle('ping', () => {
    return { pong: true, timestamp: Date.now() }
  })
}
