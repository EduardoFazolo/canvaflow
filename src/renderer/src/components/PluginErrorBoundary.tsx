import React from 'react'

interface Props {
  pluginId: string
  nodeId: string
  children: React.ReactNode
}

interface State {
  error: Error | null
  retryCount: number
}

const MAX_RETRIES = 3

/**
 * Error boundary that wraps each external plugin component.
 * On crash, shows a recovery UI inside the node's bounds.
 */
export class PluginErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, retryCount: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      `[PluginErrorBoundary] Plugin "${this.props.pluginId}" crashed (node ${this.props.nodeId}):`,
      error,
      info.componentStack,
    )
  }

  private handleRetry = (): void => {
    this.setState((s) => ({
      error: null,
      retryCount: s.retryCount + 1,
    }))
  }

  render(): React.ReactNode {
    if (this.state.error) {
      const canRetry = this.state.retryCount < MAX_RETRIES
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            background: 'rgba(255,0,0,0.04)',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, opacity: 0.4 }}>⚠</div>
          <div style={{ fontWeight: 600, color: '#f87171' }}>
            Plugin &ldquo;{this.props.pluginId}&rdquo; crashed
          </div>
          <div style={{ opacity: 0.5, maxWidth: 320, lineHeight: 1.5 }}>
            {this.state.error.message.slice(0, 200)}
          </div>
          {canRetry ? (
            <button
              onClick={this.handleRetry}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
              }}
            >
              Retry ({MAX_RETRIES - this.state.retryCount} left)
            </button>
          ) : (
            <div style={{ opacity: 0.3, fontSize: 11 }}>
              Max retries reached. Close and re-create the node.
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
