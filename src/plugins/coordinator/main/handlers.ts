import type { IpcMain, WebContents } from 'electron'
import { runCoordinator, cancelCoordinator } from './runner'
import type { CoordinatorStartPayload } from '../shared/types'

let _getWebContents: (() => WebContents | null) | null = null

export function registerCoordinatorHandlers(
  ipcMain: IpcMain,
  getWebContents: () => WebContents | null,
): void {
  _getWebContents = getWebContents

  ipcMain.handle(
    'coordinator-planner:start',
    async (_event, coordinatorId: string, payload: CoordinatorStartPayload) => {
      const wc = _getWebContents?.()
      if (!wc) throw new Error('No renderer window available')
      runCoordinator(payload, coordinatorId, wc)
      return { ok: true }
    },
  )

  ipcMain.handle('coordinator-planner:cancel', (_event, coordinatorId: string) => {
    cancelCoordinator(coordinatorId)
  })
}
