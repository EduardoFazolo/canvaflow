import { createServer } from 'http'
import { WebContents } from 'electron'
import { logAgentDebug, summarizeText } from '../shared/debug'
import { AGENT_SIGNAL_PORT } from '../shared/constants'
import type { AgentSignal, AgentFileChange } from '../shared/types'

const MAX_CLUSTER_LOG = 500

function isRendererAlive(wc: WebContents | null): wc is WebContents {
  return !!wc && !wc.isDestroyed() && !!wc.mainFrame && !wc.mainFrame.isDestroyed()
}

/** Per-cluster change log: orchestratorId → list of file changes */
const clusterChangeLogs = new Map<string, AgentFileChange[]>()

/** nodeId → orchestratorId mapping (set when an agent is registered to a cluster) */
const nodeClusterMap = new Map<string, string>()

export function registerNodeToCluster(nodeId: string, orchestratorId: string): void {
  nodeClusterMap.set(nodeId, orchestratorId)
}

export function getClusterChangeLog(orchestratorId: string): AgentFileChange[] {
  return clusterChangeLogs.get(orchestratorId) ?? []
}

export function clearClusterChangeLog(orchestratorId: string): void {
  clusterChangeLogs.delete(orchestratorId)
}

export function startAgentSignalServer(getWebContents: () => WebContents | null): void {
  const server = createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404).end(); return }

    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        if (req.url === '/agent-signal') {
          const signal = JSON.parse(body) as AgentSignal
          if (!signal.nodeId || !signal.status) { res.writeHead(400).end(); return }
          logAgentDebug('signal-server', 'received-hook-signal', {
            nodeId: signal.nodeId,
            status: signal.status,
            message: signal.message ? summarizeText(signal.message) : '',
          })
          const wc = getWebContents()
          if (isRendererAlive(wc)) wc.send('agent:status', signal)
          res.writeHead(200).end()

        } else if (req.url === '/agent-file-change') {
          const change = JSON.parse(body) as AgentFileChange
          if (!change.nodeId || !change.filePath) { res.writeHead(400).end(); return }
          logAgentDebug('signal-server', 'file-change', {
            nodeId: change.nodeId,
            filePath: change.filePath,
            toolName: change.toolName,
          })

          // Find which cluster this node belongs to
          const clusterId = nodeClusterMap.get(change.nodeId)
          if (clusterId) {
            const log = clusterChangeLogs.get(clusterId) ?? []
            log.push(change)
            if (log.length > MAX_CLUSTER_LOG) log.splice(0, log.length - MAX_CLUSTER_LOG)
            clusterChangeLogs.set(clusterId, log)

            // Broadcast to renderer so the orchestrator UI can update
            const wc = getWebContents()
            if (isRendererAlive(wc)) {
              wc.send('agent:file-change', { ...change, orchestratorId: clusterId })
            }
          }
          res.writeHead(200).end()

        } else {
          res.writeHead(404).end()
        }
      } catch {
        logAgentDebug('signal-server', 'invalid-hook-payload', {
          body: summarizeText(body),
        })
        res.writeHead(400).end()
      }
    })
  })

  server.listen(AGENT_SIGNAL_PORT, '127.0.0.1', () => {
    console.log(`[agent] Signal server listening on port ${AGENT_SIGNAL_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[agent] Port ${AGENT_SIGNAL_PORT} already in use — signal server not started`)
    } else {
      console.error('[agent] Signal server error:', err)
    }
  })
}
