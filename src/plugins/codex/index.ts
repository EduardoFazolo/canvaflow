import { createAgentTerminalPlugin } from '../agentTerminalPlugin'

export const codexPlugin = createAgentTerminalPlugin({
  id: 'codex',
  nodeType: 'codex',
  title: 'Codex',
  shell: 'codex',
  shortcut: 'Meta+Shift+X',
})
