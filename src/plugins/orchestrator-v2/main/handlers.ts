import type { IpcMain, WebContents } from 'electron'
import { runOrchestratorV2, cancelOrchestratorV2, mergeAgentBranches, cleanupOrchestratorV2 } from './runner'
import { registerNodeToCluster } from '../../../modules/servers/agentic_signals/main/server'
import type { OrcV2StartPayload } from '../shared/types'

let _getWebContents: (() => WebContents | null) | null = null

export function registerOrchestratorV2Handlers(
  ipcMain: IpcMain,
  getWebContents: () => WebContents | null,
): void {
  _getWebContents = getWebContents

  ipcMain.handle(
    'orcv2:start',
    async (_event, orchestratorId: string, payload: OrcV2StartPayload) => {
      const wc = _getWebContents?.()
      if (!wc) throw new Error('No renderer window available')
      runOrchestratorV2(payload, orchestratorId, wc)
      return { ok: true }
    },
  )

  ipcMain.handle('orcv2:cancel', (_event, orchestratorId: string) => {
    cancelOrchestratorV2(orchestratorId)
  })

  ipcMain.handle(
    'orcv2:merge',
    async (_event, orchestratorId: string, sourceRepoPath: string) => {
      const wc = _getWebContents?.()
      if (!wc) throw new Error('No renderer window available')
      mergeAgentBranches(orchestratorId, wc, sourceRepoPath)
      return { ok: true }
    },
  )

  ipcMain.handle('orcv2:cleanup', (_event, orchestratorId: string) => {
    cleanupOrchestratorV2(orchestratorId)
  })

  ipcMain.handle('orcv2:register-node', (_event, nodeId: string, orchestratorId: string) => {
    registerNodeToCluster(nodeId, orchestratorId)
  })
}
