# 02 — Worktree Canvas Views

**Status:** TODO
**Depends on:** 01-git-worktree-backend

## Goal

Extend the view/tab system so we can open new canvas tabs tied to a git worktree. Each worktree canvas is a separate canvas with its own nodes, using the worktree path as cwd. The tab should have a distinct color and show the branch name + agent status indicator.

## Background — Current View System

The view store lives at `src/renderer/src/stores/viewStore.ts`. It manages tabs at the top of the app.

Current `ViewInstance` type:
```ts
interface ViewInstance {
  id: string
  type: string      // 'canvas' | 'settings'
  label: string
  closeable: boolean
}
```

Default state: one non-closeable "Canvas" tab. The `ViewTabBar.tsx` component renders these as tabs with a bottom accent indicator on the active one.

Nodes are stored per-workspace in `nodeStore.ts` which maintains:
- `nodes`: active workspace nodes
- `workspaceNodes`: Map<workspaceId, Map<nodeId, NodeData>>
- `loadWorkspace(wsId, nodes)` swaps the active node map

## Tasks

### 1. Extend `ViewInstance` with worktree metadata

**File:** `src/renderer/src/stores/viewStore.ts`

Add optional fields to `ViewInstance`:

```ts
interface ViewInstance {
  id: string
  type: string
  label: string
  closeable: boolean
  // --- new worktree fields ---
  worktreePath?: string       // absolute path to .worktrees/<branch>/
  branchName?: string         // branch name for display
  sourceCardId?: string       // kanban card that spawned this view
  agentStatus?: AgentStatus   // 'idle' | 'thinking' | 'executing' | 'done' | 'error' etc.
  agentNodeId?: string        // the claude node running in this view
}
```

Import `AgentStatus` from `src/modules/servers/agentic_signals/shared/types.ts`.

### 2. Add `createWorktreeView()` action

**File:** `src/renderer/src/stores/viewStore.ts`

Add to the store:

```ts
createWorktreeView: (params: {
  worktreePath: string
  branchName: string
  sourceCardId: string
}) => string   // returns view ID

updateAgentStatus: (viewId: string, status: AgentStatus, agentNodeId?: string) => void
```

Implementation of `createWorktreeView`:
1. Generate a unique view ID: `wt-${branchName}-${Date.now()}`
2. Create a `ViewInstance` with:
   - `type: 'canvas'`
   - `label: branchName`
   - `closeable: true`
   - All worktree fields populated
   - `agentStatus: 'idle'`
3. Call `open(instance)` which adds and activates it

Implementation of `updateAgentStatus`:
1. Find the instance by `viewId` in `instances`
2. Update its `agentStatus` (and `agentNodeId` if provided)
3. Trigger a re-render by replacing the instance in the array

### 3. Wire canvas to use worktree cwd

When a worktree canvas tab is active, any new nodes created in it must use the worktree path as their `cwd`.

**File:** `src/renderer/src/stores/nodeStore.ts`

The `add(type, x, y, props)` action needs to be aware of the active view's worktree path. The simplest approach:

- When creating a node, check if the active view has a `worktreePath`
- If so, inject `cwd: worktreePath` into the node's props
- This affects terminal nodes and Claude nodes which read `cwd` from props

Alternatively, the caller (the modal in phase 03) can pass `cwd` explicitly in the props, which is simpler and doesn't require modifying nodeStore. **Prefer this approach** — the modal already knows the worktree path.

### 4. Worktree canvas node isolation

Each worktree view should have its own node set. The current system stores nodes per workspace. For worktree views within the same workspace, we need sub-isolation.

**Approach:** Use the view ID as a "virtual workspace" key in the `workspaceNodes` map. When switching to a worktree tab:
- Save current canvas nodes under the previous view's key
- Load (or initialize empty) nodes for the worktree view's key
- When switching back to the main canvas, restore its nodes

**File:** `src/renderer/src/stores/nodeStore.ts`

Add a helper that the ViewTabBar calls when switching tabs:

```ts
switchToView: (viewId: string) => void
```

This function:
1. Saves current nodes to `workspaceNodes` under the current view key
2. Loads nodes for the new view key (empty Map if first time)
3. Updates `nodes` to the new set

The key in `workspaceNodes` should be:
- Main canvas: `workspaceId` (existing behavior)
- Worktree canvas: `workspaceId:viewId`

### 5. Style worktree tabs in ViewTabBar

**File:** `src/renderer/src/components/ViewTabBar.tsx`

For tabs where `inst.worktreePath` is defined:

**Title color:** Use `#22d3ee` (cyan) instead of the default white. This makes worktree tabs visually distinct.

**Status indicator dot:** Render a small circle (6px) to the left of the label:
- `idle`: gray `rgba(255,255,255,0.2)`
- `thinking`: pulsing amber `#f59e0b` with CSS animation
- `executing` / `modifying_files`: pulsing blue `#3b82f6`
- `done`: solid green `#22c55e`
- `error`: solid red `#ef4444`

**Tab icon:** Add a git-branch icon for worktree tabs:
```tsx
function tabIcon(type: string, isWorktree: boolean): React.ReactElement {
  if (isWorktree) return <GitBranchIcon />
  if (type === 'canvas') return <CanvasTabIcon />
  if (type === 'settings') return <SettingsTabIcon />
  return <CanvasTabIcon />
}
```

**Close button behavior:** When closing a worktree tab, don't delete the worktree yet — just close the view. Cleanup happens in phase 06.

### 6. Persist worktree views across restarts

Worktree view instances need to survive app restarts so the user doesn't lose tabs.

**File:** `src/renderer/src/stores/viewStore.ts`

Add persistence:
- On any change to `instances`, save to `window.appState.set('views_${workspaceId}', JSON.stringify(instances))`
- On workspace load, restore from `window.appState.get('views_${workspaceId}')`
- Use a debounce (400ms) similar to the kanban store
- Set `agentStatus` to `'idle'` on restore (agent is no longer running after restart)

## Acceptance Criteria

- `createWorktreeView()` opens a new closeable tab with the branch name and cyan-colored title
- Switching between tabs preserves each canvas's nodes independently
- The active tab shows a status indicator dot that reflects agent state
- Worktree tabs show a git-branch icon
- Tab state persists across app restarts
- Closing a worktree tab removes the tab but does not delete the worktree
