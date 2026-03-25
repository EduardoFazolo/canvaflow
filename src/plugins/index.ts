import type React from 'react'
import { OrchestratorMount } from './orchestrator'
import { OrchestratorV2Mount } from './orchestrator-v2'

export interface Plugin {
  id: string
  SettingsSection?: React.ComponentType
  CanvasMount?: React.ComponentType
}

export const plugins: Plugin[] = [
  { id: 'orchestrator', CanvasMount: OrchestratorMount },
  { id: 'orchestrator-v2', CanvasMount: OrchestratorV2Mount },
]
