import { OrchestratorV2Node } from './renderer/OrchestratorV2Node'
import { RepoAgentNode } from './renderer/RepoAgentNode'
import { OrchestratorV2Mount } from './orchestratorV2Mount'
import type { CanvaFlowPlugin } from '../types'

export { OrchestratorV2Mount }

export const orchestratorV2Plugin: CanvaFlowPlugin = {
  id: 'orchestrator-v2',
  nodeType: 'orchestrator-v2',
  defaultSize: { width: 560, height: 340 },
  defaultTitle: 'Orchestrator V2',
  component: OrchestratorV2Node,
  sidebarLabel: 'Orchestrator V2',
}

export const repoAgentPlugin: CanvaFlowPlugin = {
  id: 'repo-agent',
  nodeType: 'repo-agent',
  defaultSize: { width: 480, height: 220 },
  defaultTitle: 'Repo Agent',
  component: RepoAgentNode,
}
