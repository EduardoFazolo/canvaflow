# 05 — Status Bridge (Agent → Kanban)

**Status:** TODO
**Depends on:** 04-agent-spawning

## Goal

Connect the existing agentic signal system to the kanban board so that when a Claude agent finishes its work (`status: 'done'`), the corresponding kanban card is automatically moved from "In Progress" to "Review". Also update the worktree tab's status indicator in real time.

## Background — Signal Flow

The agentic signal system works like this:

1. Claude process triggers hooks defined in `~/.claude/settings.json`
2. Hooks call `~/.canvaflow/bin/canvaflow-signal <status>` with `CANVAFLOW_NODE_ID` env var
3. Script POSTs to `http://127.0.0.1:39847/agent-signal` with `{ nodeId, status }`
4. Signal server in main process sends IPC event `'agent:status'` to renderer
5. Renderer receives via `window.agent.onStatus(callback)`

The callback receives `{ nodeId: string, status: AgentStatus }`.

The status lifecycle is:
```
idle → thinking → executing/modifying_files → ... → done | error
```

## Tasks

### 1. Create card-agent mapping store

**File:** `src/renderer/src/stores/cardAgentMapStore.ts` (new file)

This store maps kanban cards to their worktree views and agent nodes.

```ts
import { create } from 'zustand'

interface CardAgentMapping {
  cardId: string
  viewId: string
  agentNodeId: string
  branchName: string
  worktreePath: string
  boardId: string        // which kanban board this card belongs to
  sourceColId: string    // original column (to know where it was)
  targetColId: string    // "In Progress" column ID
  workspaceId: string
}

interface CardAgentMapStore {
  mappings: CardAgentMapping[]

  addMapping: (mapping: CardAgentMapping) => void
  removeMapping: (cardId: string) => void
  getMappingByNodeId: (nodeId: string) => CardAgentMapping | undefined
  getMappingByCardId: (cardId: string) => CardAgentMapping | undefined

  // Persistence
  load: (workspaceId: string) => Promise<void>
  persist: () => void
}
```

**Persistence:** Save to `window.appState.set('kanban_agent_map_${workspaceId}', JSON.stringify(mappings))`. Debounce 400ms.

**Load:** Called when workspace is loaded. Parse from `app_state` or default to empty array.

### 2. Save mapping when worktree is created

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx` (in the `onConfirm` handler)

After creating the worktree view and spawning the agent node (phases 03-04), save the mapping:

```ts
useCardAgentMapStore.getState().addMapping({
  cardId: card.id,
  viewId,
  agentNodeId: newNode.id,
  branchName: config.branchName,
  worktreePath,
  boardId: activeBoard.id,
  sourceColId: worktreeDropPayload.sourceColId,
  targetColId: worktreeDropPayload.targetColId,
  workspaceId: workspace.id,
})
```

### 3. Listen for agent status changes

**File:** `src/renderer/src/App.tsx` or a top-level effect hook

Set up a global listener for agent status signals and route them to both the view store (tab indicator) and the kanban flow:

```ts
useEffect(() => {
  const unsubscribe = window.agent.onStatus((signal: AgentSignal) => {
    const { nodeId, status } = signal

    // Update view tab indicator
    const viewStore = useViewStore.getState()
    const view = viewStore.instances.find(v => v.agentNodeId === nodeId)
    if (view) {
      viewStore.updateAgentStatus(view.id, status)
    }

    // Check if this agent is tracked by the kanban bridge
    const mapping = useCardAgentMapStore.getState().getMappingByNodeId(nodeId)
    if (!mapping) return

    if (status === 'done') {
      // Move card to "Review"
      moveCardToReview(mapping)
    }
  })

  return unsubscribe
}, [])
```

**Important:** This listener should be set up once at the app level, not inside the kanban component (which might unmount).

### 4. Implement `moveCardToReview`

**File:** `src/plugins/kanban/store.ts` (add new action) or as a standalone function

```ts
function moveCardToReview(mapping: CardAgentMapping): void {
  const store = useKanbanStore.getState()
  const board = store.state.boards.find(b => b.id === mapping.boardId)
  if (!board) return

  // Find the "REVIEW" column (case-insensitive title match)
  const reviewCol = board.columns.find(c => c.title.toUpperCase() === 'REVIEW')
  if (!reviewCol) return

  // Find the card's current column (should be "In Progress")
  const currentCol = board.columns.find(c => c.cards.some(card => card.id === mapping.cardId))
  if (!currentCol) return

  // Move card
  const card = currentCol.cards.find(c => c.id === mapping.cardId)
  if (!card) return

  const newColumns = board.columns.map(col => {
    if (col.id === currentCol.id) {
      return { ...col, cards: col.cards.filter(c => c.id !== mapping.cardId) }
    }
    if (col.id === reviewCol.id) {
      return { ...col, cards: [...col.cards, card] }
    }
    return col
  })

  // Update board
  store.setState({
    ...store.state,
    boards: store.state.boards.map(b =>
      b.id === mapping.boardId ? { ...b, columns: newColumns } : b
    ),
  })
}
```

### 5. Add `moveCardToColumn` to kanban store

**File:** `src/plugins/kanban/store.ts`

Expose a general-purpose card move action so it's reusable:

```ts
moveCardToColumn: (boardId: string, cardId: string, targetColTitle: string) => void
```

This finds the card in any column, removes it, and appends it to the target column (matched by title, case-insensitive). Used by both the status bridge and potentially the UX polish phase.

### 6. Handle error status

When the agent emits `status: 'error'`:
- Keep the card in "In Progress" (don't move it)
- Update the view tab indicator to show red error dot
- Log the error message from the signal

The user can then inspect the worktree canvas to see what went wrong and potentially retry.

### 7. Optional: show a toast notification

When a card auto-moves to "Review", show a brief toast notification:
- Text: `"✓ {card.title} ready for review"`
- Duration: 3 seconds
- Position: bottom-right

This is optional but nice UX since the user might be on a different tab. If the app already has a toast system, use it. If not, skip this for now.

## Acceptance Criteria

- When a Claude agent signals `done`, the corresponding kanban card moves from "In Progress" to "Review" automatically
- The worktree tab's status dot updates in real time as the agent works (thinking → executing → done)
- The card-agent mapping persists across app restarts
- Agent errors keep the card in "In Progress" and show a red indicator on the tab
- Multiple concurrent worktree agents can run without interfering with each other's status tracking
