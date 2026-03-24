/**
 * CanvaFlow Plugin — Renderer Bundle
 *
 * This file is the entry point for the renderer (React) side of your plugin.
 * It must export a `component` that receives `{ node }` props.
 *
 * Available imports (provided by the host):
 *   - 'react' — React 18
 *
 * To communicate with the main process, use:
 *   window.pluginIpc.invoke('{{PLUGIN_ID}}', 'channelName', ...args)
 */

const React = require('react')

function PluginNode({ node }: { node: { id: string; width: number; height: number; props: Record<string, unknown> } }) {
  return React.createElement('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.5)',
      fontSize: 14,
      fontFamily: 'monospace',
    },
  }, '{{PLUGIN_NAME}} plugin loaded!')
}

module.exports = {
  component: PluginNode,
}
