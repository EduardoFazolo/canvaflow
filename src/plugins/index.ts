import type React from 'react'
import { OrchestratorMount } from './orchestrator'
import { CoordinatorMount } from './coordinator/renderer/CoordinatorMount'

export interface Plugin {
  id: string
  SettingsSection?: React.ComponentType
  CanvasMount?: React.ComponentType
}

export const plugins: Plugin[] = [
  { id: 'orchestrator', CanvasMount: OrchestratorMount },
  { id: 'coordinator', CanvasMount: CoordinatorMount },
]
