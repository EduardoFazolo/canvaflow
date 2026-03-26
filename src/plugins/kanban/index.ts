import { KanbanNode } from './renderer/KanbanNode'
import type { CanvaFlowPlugin } from '../types'

export const kanbanPlugin: CanvaFlowPlugin = {
  id: 'kanban',
  nodeType: 'kanban',
  defaultSize: { width: 980, height: 560 },
  defaultTitle: 'Kanban Board',
  component: KanbanNode,
  sidebarLabel: 'Kanban',
}
