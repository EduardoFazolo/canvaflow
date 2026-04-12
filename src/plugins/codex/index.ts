import { CodexNode } from './renderer/CodexNode'
import type { CanvaFlowPlugin } from '../types'

export const codexPlugin: CanvaFlowPlugin = {
  id: 'codex',
  nodeType: 'codex',
  defaultSize: { width: 700, height: 480 },
  defaultTitle: 'Codex',
  component: CodexNode,
  keepAlive: true,
  sidebarLabel: 'Codex',
  shortcut: 'Meta+Shift+X',
}
