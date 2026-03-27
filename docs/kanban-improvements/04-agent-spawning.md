# 04 — Agent Spawning in Worktree Canvas

**Status:** TODO
**Depends on:** 03-kanban-in-progress-modal

## Goal

After the worktree canvas tab is created and activated, spawn a Claude (or Orchestrator) agent node inside it. The agent must:
- Use the worktree path as its working directory
- Run with `--dangerously-skip-permissions` so it works autonomously
- Have the card title/description injected as its initial prompt
- Have its `CANVAFLOW_NODE_ID` set so the agentic signal system can track it

## Background — How Claude Nodes Work

The Claude plugin (`src/plugins/claude/`) works like this:

1. `ClaudeNode.tsx` wraps `TerminalNode` with `shell: 'claude'` (or `'claude {flags}'` if `claudeFlags` prop is set)
2. `TerminalNode` calls `window.terminal.create(nodeId, cwd, shell)` which spawns a PTY in main process
3. The PTY manager (`src/main/pty.ts` or equivalent) spawns the shell command with env vars including `CANVAFLOW_NODE_ID=<nodeId>` and `CANVAFLOW_PORT=39847`
4. Claude reads `~/.claude/settings.json` hooks which call `canvaflow-signal` and `canvaflow-log-change` scripts
5. Those scripts POST to the signal server, which broadcasts IPC events back to the renderer

The key props for a Claude node:
```ts
{
  cwd: string            // working directory for the PTY
  claudeFlags?: string   // extra flags appended to 'claude' command
}
```

## Tasks

### 1. Spawn Claude node with correct flags and cwd

**File:** `src/plugins/kanban/renderer/WorktreeStartModal.tsx` (or the `onConfirm` handler in KanbanNode)

After creating the worktree view and switching to it (from phase 03), create the Claude node:

```ts
// Inside the onConfirm handler, after createWorktreeView():

const nodeStore = useNodeStore.getState()

if (config.agentId === 'claude') {
  const newNode = nodeStore.add('claude', 100, 100, {
    cwd: worktreePath,
    claudeFlags: '--dangerously-skip-permissions',
  })

  // Store the node ID in the view for status tracking
  useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)

  // Inject the task prompt after a delay (PTY needs time to initialize)
  const prompt = card.description
    ? `${card.title}\n\n${card.description}`
    : card.title
  setTimeout(() => {
    window.terminal.write(newNode.id, prompt + '\n')
  }, 2000) // 2s delay to let Claude boot up
}
```

**Important:** The node is created with `x: 100, y: 100` — centered-ish in the new empty canvas. Adjust coordinates as needed.

### 2. Spawn Orchestrator node (alternative agent)

If the user picks "Orchestrate" instead of "Claude":

```ts
if (config.agentId === 'orchestrate') {
  const text = card.description
    ? `${card.title}\n\n${card.description}`
    : card.title

  const newNode = nodeStore.add('orchestrator', 100, 100, {
    task: card.title,
    status: 'idle',
    subagentIds: [],
  })

  useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)

  await window.orchestrator.start(newNode.id, {
    task: card.title,
    markdown: text,
    worldX: 100,
    worldY: 100,
    workspacePath: worktreePath,
  })
}
```

The orchestrator will decompose the task and spawn sub-agent nodes, all using the worktree path.

### 3. Ensure PTY spawns with correct env vars

**File:** Check `src/main/pty.ts` (or wherever PTY creation happens)

Verify that when a Claude node is created with `cwd: worktreePath`, the PTY is spawned in that directory. The existing flow should handle this since `cwd` is passed to `node-pty`. But verify:

- `CANVAFLOW_NODE_ID` is set to the new node's ID (this should already work)
- `CANVAFLOW_PORT` is set (this should already work via `setupAgenticSignalTools()`)
- The shell command is `claude --dangerously-skip-permissions` (constructed from `claudeFlags` prop)

If `claudeFlags` is not already respected by `ClaudeNode.tsx`, check the code. Based on the exploration, it is:

```tsx
// ClaudeNode.tsx
const claudeFlags = (node.props.claudeFlags as string) ?? ''
const claudeNode = {
  ...node,
  props: {
    ...node.props,
    shell: claudeFlags ? `claude ${claudeFlags}` : 'claude',
  },
}
return <TerminalNode node={claudeNode} />
```

This means passing `claudeFlags: '--dangerously-skip-permissions'` will make the shell command `claude --dangerously-skip-permissions`. Confirmed working.

### 4. Handle the timing of view switch + node creation

There's a sequencing concern: we create the worktree view, which triggers a canvas switch, then we add a node. The node must be added to the *new* canvas's node set, not the main canvas.

The flow should be:
1. `createWorktreeView()` — creates and activates the view
2. `switchToView(viewId)` — swaps node store to the new view's node set (phase 02 task)
3. `nodeStore.add(...)` — adds the Claude node to the now-active (empty) canvas
4. The node gets persisted under the worktree view's key

**Verify** that `nodeStore.add()` adds to whatever is currently active. If `switchToView` correctly swaps the `nodes` map, then `add()` should work because it operates on the active `nodes` map.

### 5. Set initial camera position for worktree canvas

When the worktree canvas is first opened, it's empty. Set the camera to a reasonable default so the spawned node is visible:

```ts
// After creating the view and before adding nodes
useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
```

This ensures the node at `(100, 100)` is visible without needing to pan.

## Acceptance Criteria

- Picking "Claude" in the modal creates a Claude node in the worktree canvas with `cwd` set to the worktree path
- The Claude process runs with `--dangerously-skip-permissions` flag
- The card title (and description if any) is sent as the initial prompt ~2s after node creation
- The agentic signal system tracks this node (status updates flow through)
- Picking "Orchestrate" creates an orchestrator node that decomposes the task in the worktree
- The node appears in the center of the new canvas, visible without panning
