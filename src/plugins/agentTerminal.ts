import { pluginRegistry, type CanvaFlowPlugin, PluginRegistry } from './types'

export interface AgentTerminalPlugin extends CanvaFlowPlugin {
  readonly agentTerminal: {
    readonly shell: string
  }
}

interface PluginLookup {
  get(nodeType: string): CanvaFlowPlugin | undefined
}

interface PluginListLookup {
  getAll(): CanvaFlowPlugin[]
}

export function isAgentTerminalPlugin(plugin: CanvaFlowPlugin | undefined): plugin is AgentTerminalPlugin {
  return !!plugin?.agentTerminal
}

export function isAgentTerminalNodeType(
  nodeType: string,
  registry: PluginLookup = pluginRegistry,
): boolean {
  return isAgentTerminalPlugin(registry.get(nodeType))
}

export function getAgentTerminalPlugins(
  registry: PluginListLookup = pluginRegistry,
): AgentTerminalPlugin[] {
  return registry.getAll().filter(isAgentTerminalPlugin)
}

export function getAgentTerminalTitle(
  nodeType: string,
  registry: PluginLookup = pluginRegistry,
): string | null {
  const plugin = registry.get(nodeType)
  return isAgentTerminalPlugin(plugin) ? plugin.defaultTitle : null
}

export function getAgentTerminalDropLabel(
  nodeType: string,
  registry: PluginLookup = pluginRegistry,
): string | null {
  const title = getAgentTerminalTitle(nodeType, registry)
  return title ? `Drop to send to ${title}` : null
}

export function createPluginRegistry(): PluginRegistry {
  return new PluginRegistry()
}
