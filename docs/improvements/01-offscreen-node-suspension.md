# Off-Screen Node Suspension

## Problem

CanvaFlow currently culls off-screen nodes from the React tree, but the underlying processes (PTY sessions, webview rendering) keep running at full throttle. With many nodes on the canvas, this wastes CPU and memory on content the user can't see.

## Proposal

Introduce a suspension layer that throttles or pauses resources for nodes outside the viewport.

### Terminals

- **Stop reading PTY output** when a terminal node leaves the viewport. tmux continues buffering in the background.
- **Resume reading** when the node re-enters the viewport. tmux replays the buffered output automatically.
- Implementation: track viewport visibility in `nodeStore` or `cameraStore`, and gate the `onData` listener in `TerminalNode` behind a `isVisible` flag.

### Browser Webviews

- Call `webContents.setBackgroundThrottling(true)` on off-screen webviews (Electron already does this partially, but we can be more aggressive).
- Consider `webContents.setFrameRate(1)` for off-screen webviews to nearly freeze rendering.
- On re-entry, restore normal frame rate.

### Plugin Nodes (Monaco, Claude, etc.)

- Monaco: dispose the editor model when off-screen, recreate on re-entry (saves significant memory per editor instance).
- Claude/Notion/Trello webviews: same throttling as browser nodes.

## Impact

- Reduces CPU usage proportional to the number of off-screen nodes
- Reduces memory pressure, especially with many Monaco editors or browser tabs
- Enables scaling to 50+ nodes without degrading performance

## Complexity

Medium. The visibility tracking infrastructure is needed first, then each node type opts into suspension independently.
