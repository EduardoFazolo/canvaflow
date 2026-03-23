import { describe, expect, it } from 'vitest'
import {
  createPluginRegistry,
  getAgentTerminalDropLabel,
  getAgentTerminalPlugins,
  getAgentTerminalTitle,
  isAgentTerminalNodeType,
} from '../plugins/agentTerminal'
import type { CanvaFlowPlugin } from '../plugins/types'

const createFakePlugin = (overrides: Partial<CanvaFlowPlugin> = {}): CanvaFlowPlugin => ({
  id: 'note-like',
  nodeType: 'note-like',
  defaultSize: { width: 300, height: 200 },
  defaultTitle: 'Note Like',
  component: (() => null) as any,
  ...overrides,
})

describe('agentTerminal plugin helpers', () => {
  it('discovers only terminal-backed agent plugins from the registry', () => {
    const registry = createPluginRegistry()
    registry.register(createFakePlugin())
    registry.register(createFakePlugin({
      id: 'claude',
      nodeType: 'claude',
      defaultTitle: 'Claude',
      agentTerminal: { shell: 'claude' },
    }))
    registry.register(createFakePlugin({
      id: 'codex',
      nodeType: 'codex',
      defaultTitle: 'Codex',
      agentTerminal: { shell: 'codex' },
    }))

    expect(getAgentTerminalPlugins(registry).map((plugin) => plugin.nodeType)).toEqual([
      'claude',
      'codex',
    ])
  })

  it('treats a future agent plugin as a valid agent target without helper changes', () => {
    const registry = createPluginRegistry()
    registry.register(createFakePlugin({
      id: 'gemini',
      nodeType: 'gemini',
      defaultTitle: 'Gemini',
      agentTerminal: { shell: 'gemini' },
    }))

    expect(isAgentTerminalNodeType('gemini', registry)).toBe(true)
    expect(getAgentTerminalTitle('gemini', registry)).toBe('Gemini')
    expect(getAgentTerminalDropLabel('gemini', registry)).toBe('Drop to send to Gemini')
  })

  it('does not classify non-agent plugins as terminal-backed agents', () => {
    const registry = createPluginRegistry()
    registry.register(createFakePlugin())

    expect(isAgentTerminalNodeType('note-like', registry)).toBe(false)
    expect(getAgentTerminalTitle('note-like', registry)).toBeNull()
    expect(getAgentTerminalDropLabel('note-like', registry)).toBeNull()
  })
})
