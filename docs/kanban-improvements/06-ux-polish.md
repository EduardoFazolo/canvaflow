# 06 — UX Polish & Edge Cases

**Status:** TODO
**Depends on:** 05-status-bridge

## Goal

Handle edge cases, add visual polish to kanban cards and worktree tabs, implement worktree cleanup, and make the whole flow feel solid.

## Tasks

### 1. Kanban card badges

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Cards that have an active worktree agent should show a status badge. Use the `cardAgentMapStore` to check if a card has a mapping.

In the `CardItem` component, look up the mapping:

```tsx
const mapping = useCardAgentMapStore(s => s.getMappingByCardId(card.id))
```

If a mapping exists, render a small badge on the card:
- **In Progress + agent working**: Small pulsing dot (amber/blue) in the top-right corner of the card
- **In Review + agent done**: Small green checkmark icon
- **In Progress + agent error**: Small red dot

Style: 8px circle, positioned `top: 6px, right: 6px` inside the card, with `position: absolute`.

### 2. Worktree cleanup on "Done"

When a card is moved to the "Done" column (either manually dragged or programmatically), prompt the user to clean up the worktree:

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Intercept drops to the "DONE" column (similar to how we intercept "IN PROGRESS"):

```ts
if (targetCol.title.toUpperCase() === 'DONE') {
  const mapping = useCardAgentMapStore.getState().getMappingByCardId(cardId)
  if (mapping) {
    // Show confirmation: "Delete worktree and close tab?"
    // If yes:
    //   1. window.git.worktreeRemove(mapping.worktreePath)
    //   2. useViewStore.getState().close(mapping.viewId)
    //   3. useCardAgentMapStore.getState().removeMapping(cardId)
    // If no:
    //   Just move the card, keep worktree alive
  }
}
```

Use a simple confirm modal (can reuse the portal pattern from TaskDropModal) with two buttons: "Delete worktree" and "Keep worktree".

### 3. Handle "workspace is not a git repo"

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Before showing the WorktreeStartModal, check `window.git.isRepo(workspace.path)`. If not a repo, fall through to the normal column drop behavior (just move the card, no modal).

### 4. Handle "branch already exists"

**File:** `src/plugins/kanban/renderer/WorktreeStartModal.tsx`

When the user confirms, `git worktree add -b <branch>` will fail if the branch already exists. Catch this error and:

1. Check if a worktree for that branch already exists via `window.git.worktreeList()`
2. If worktree exists: offer to reuse it (open a new tab pointing to the existing worktree)
3. If branch exists but no worktree: offer to create worktree from existing branch (use `git worktree add <path> <branch>` without `-b`)
4. Show the error message in the modal so the user can adjust the branch name

### 5. Handle manual tab close while agent is running

**File:** `src/renderer/src/stores/viewStore.ts`

When `close(viewId)` is called for a worktree view that has `agentStatus` not equal to `'done'` or `'error'`:

- Show a warning: "An agent is still running in this worktree. Close anyway?"
- If confirmed, close the tab. The agent PTY will be killed when the terminal node is unmounted.
- Update the card badge to show that the agent was interrupted (remove the mapping or mark it as interrupted).

### 6. Re-open worktree tab from kanban card

Allow clicking on an "In Progress" card (that has a mapping) to switch to its worktree tab:

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Add an `onClick` handler to `CardItem` when it has a mapping:

```tsx
onClick={() => {
  if (mapping) {
    useViewStore.getState().activate(mapping.viewId)
  }
}
```

Style the card with a subtle hover effect that indicates it's clickable when it has a mapping (e.g., cursor: pointer, slight border glow).

### 7. Worktree tab title bar accent

**File:** `src/renderer/src/components/ViewTabBar.tsx`

When the active tab is a worktree tab, change the bottom accent line color from the default `#a78bfa` (purple) to `#22d3ee` (cyan). This gives a visual cue that you're in a worktree context.

Also consider showing a subtle banner below the tab bar when a worktree canvas is active:
```
📍 Worktree: feature/my-task  •  Branch from: main
```

Style: `height: 22px`, `background: rgba(34,211,238,0.06)`, `border-bottom: 1px solid rgba(34,211,238,0.15)`, `font-size: 11px`, `color: rgba(34,211,238,0.6)`.

This is optional — skip if it feels cluttered.

### 8. Prevent creating duplicate worktrees for the same card

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Before showing the WorktreeStartModal, check if the card already has a mapping:

```ts
const existingMapping = useCardAgentMapStore.getState().getMappingByCardId(cardId)
if (existingMapping) {
  // Card already has a worktree — just switch to its tab
  useViewStore.getState().activate(existingMapping.viewId)
  // Move card to target column (it might have been dragged back to backlog and re-dragged)
  return
}
```

### 9. Persist and restore on restart

On app restart:
- Worktree views are restored from persisted view state (phase 02, task 6)
- Card-agent mappings are restored from `app_state`
- But the agent is no longer running, so:
  - Set `agentStatus` to `'idle'` on all restored worktree views
  - Card badges should reflect that the agent stopped (show a gray "paused" indicator)
  - The user can re-open the worktree tab and manually restart the agent if needed

### 10. Keyboard shortcut to cycle worktree tabs

Optional: Add `Cmd+Shift+]` and `Cmd+Shift+[` to cycle between worktree tabs. Or just rely on the existing tab click behavior.

## Acceptance Criteria

- Cards show status badges reflecting their agent's state
- Moving a card to "Done" prompts to delete the worktree
- Branch conflicts are handled gracefully with clear error messages
- Closing a tab with a running agent shows a warning
- Clicking an "In Progress" card with a mapping switches to its worktree tab
- Duplicate worktree creation is prevented
- App restart gracefully handles the fact that agents are no longer running
