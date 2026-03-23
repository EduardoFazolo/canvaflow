import { createAgentTerminalPlugin } from '../agentTerminalPlugin'

export const claudePlugin = createAgentTerminalPlugin({
  id: 'claude',
  nodeType: 'claude',
  title: 'Claude',
  shell: 'claude',
  shortcut: 'Meta+Shift+C',
})
