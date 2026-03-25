import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import '../../plugins/monaco/setup'
import { pluginRegistry } from '../../plugins/types'
import { notionPlugin } from '../../plugins/notion'
import { claudePlugin } from '../../plugins/claude'
import { monacoPlugin } from '../../plugins/monaco'
import { trelloPlugin } from '../../plugins/trello'
import { lovablePlugin } from '../../plugins/lovable'
import { orchestratorPlugin, subagentPlugin } from '../../plugins/orchestrator'
import { orchestratorV2Plugin, repoAgentPlugin } from '../../plugins/orchestrator-v2'
import { windowPickerPlugin } from '../../plugins/windowpicker'

// Register plugins before the app renders
pluginRegistry.register(notionPlugin)
pluginRegistry.register(claudePlugin)
pluginRegistry.register(monacoPlugin)
pluginRegistry.register(trelloPlugin)
pluginRegistry.register(lovablePlugin)
pluginRegistry.register(orchestratorPlugin)
pluginRegistry.register(subagentPlugin)
pluginRegistry.register(orchestratorV2Plugin)
pluginRegistry.register(repoAgentPlugin)
pluginRegistry.register(windowPickerPlugin)

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] React crash:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#ff6b6b', fontFamily: 'monospace', background: '#1a1a1a', height: '100vh' }}>
          <h2>React crash — check DevTools console for stack trace</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String(this.state.error)}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
