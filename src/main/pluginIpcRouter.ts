import type { IpcMainLike } from '../plugins/types'

/**
 * Creates a scoped IPC proxy for an external plugin.
 * All channels are automatically namespaced under `plugin:<pluginId>:<channel>`
 * to prevent external plugins from hijacking built-in IPC channels.
 */
export function createScopedIpc(pluginId: string, realIpcMain: IpcMainLike): IpcMainLike {
  const prefix = `plugin:${pluginId}:`

  return {
    handle(channel, listener) {
      realIpcMain.handle(`${prefix}${channel}`, listener)
    },
    on(channel, listener) {
      realIpcMain.on(`${prefix}${channel}`, listener)
    },
    removeHandler(channel) {
      realIpcMain.removeHandler(`${prefix}${channel}`)
    },
  }
}
