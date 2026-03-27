# Node Crash Detection & Recovery

## Problem

When a webview crashes, a PTY dies, or a plugin fails, the node becomes a dead tile on the canvas with no way to recover other than closing and recreating it.

## Proposal

Add health monitoring and automatic recovery for each node type.

### Webview Nodes (Browser, Notion, Trello, Claude, Lovable)

- Listen to the `crashed`, `did-fail-load`, and `unresponsive` events on the webview's `webContents`.
- On crash: show a recovery overlay on the node with a "Reload" button.
- Optionally auto-retry once after a short delay (1-2s).
- Track crash count per node to avoid infinite restart loops (max 3 retries, then show permanent error state).

### Terminal Nodes

- Listen to the PTY `exit` event.
- If the exit was unexpected (non-zero exit code, or the user didn't close it), show a "Restart" overlay.
- On restart: create a new tmux pane in the same session, reconnect xterm.
- If tmux itself died, detect via `tmux has-session` failure and re-create the session.

### Plugin Nodes

- Add an optional `onHealthCheck` hook to the `CanvaFlowPlugin` interface.
- The node layer periodically calls it (every 30s) for mounted nodes.
- If the check fails, show the recovery overlay.

### Recovery Overlay Component

Create a shared `NodeRecoveryOverlay` component:

```tsx
// Renders over the node content when in error state
<NodeRecoveryOverlay
  message="This terminal has stopped"
  onRetry={() => restartNode(nodeId)}
  retryCount={retryCount}
  maxRetries={3}
/>
```

## Impact

- Eliminates dead nodes that require manual close + recreate
- Improves reliability for long-running workspaces (hours/days)
- Builds user trust that the canvas is resilient

## Complexity

Medium. Each node type needs its own detection logic, but the recovery UI is shared.
