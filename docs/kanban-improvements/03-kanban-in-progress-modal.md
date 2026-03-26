# 03 — Kanban "In Progress" Drop Modal

**Status:** TODO
**Depends on:** 02-worktree-canvas-views

## Goal

When a kanban card is dropped into the "In Progress" column, intercept the drop and show a modal (reusing the `TaskDropModal` design). The modal lets the user pick an agent, configure the branch name, and toggle whether to branch from HEAD or `main`. On confirm, it creates the worktree, opens a new canvas tab, and moves the card.

## Background — Current Drop Flow

In `KanbanNode.tsx`, the column drop logic lives in `onDropOnColumn(targetColId, insertIndex?)`. When a card is dropped on a column, it simply moves the card in the data model via `updateBoard(newColumns)`.

The external-drop flow (dragging a card *out* of the kanban onto the canvas) is handled separately via `onDragEnd` which detects `droppedInternally === false` and shows a `KanbanDropModal`.

The columns are identified by their `id` (a UUID generated at creation time) and their `title` string. The default "In Progress" column has title `"IN PROGRESS"` and color `#1c7ed6`.

## Tasks

### 1. Intercept drops to "In Progress" column

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Modify `onDropOnColumn` to detect when the target column title is `"IN PROGRESS"` (case-insensitive match). Instead of immediately moving the card, set a pending state that triggers the modal.

Add state to `KanbanNode`:
```ts
const [worktreeDropPayload, setWorktreeDropPayload] = useState<{
  card: KanbanCard
  sourceColId: string
  targetColId: string
} | null>(null)
```

In `onDropOnColumn`, before the existing move logic:
```ts
const targetCol = activeBoard.columns.find(c => c.id === targetColId)
if (targetCol && targetCol.title.toUpperCase() === 'IN PROGRESS') {
  const srcCol = activeBoard.columns.find(c => c.id === srcColId)
  const card = srcCol?.cards.find(c => c.id === cardId)
  if (card) {
    setWorktreeDropPayload({ card, sourceColId: srcColId, targetColId })
    // Reset drag state but don't move the card yet
    dragCardId = null
    dragSourceColId = null
    return
  }
}
```

### 2. Create the `WorktreeStartModal` component

**File:** `src/plugins/kanban/renderer/WorktreeStartModal.tsx` (new file)

This modal reuses the visual design of `TaskDropModal` (`src/renderer/src/components/ui/task-drop-modal.tsx`) but is specific to the worktree flow.

**Props:**
```ts
interface WorktreeStartModalProps {
  card: KanbanCard
  onConfirm: (config: WorktreeConfig) => Promise<void>
  onClose: () => void
}

interface WorktreeConfig {
  agentId: 'orchestrate' | 'claude'
  branchName: string
  branchFromMain: boolean
}
```

**Layout** (copy visual style from TaskDropModal):

1. **Header**: Card title + description (if any)

2. **Branch name field**:
   - Auto-derived from card title via `titleToBranchName()` (import from task-drop-modal or extract to shared util)
   - Editable — the user can tweak the branch name
   - Monospace font, shows the full branch name

3. **"Branch from main" toggle**:
   - Same toggle switch design as the existing "Checkout new branch" toggle
   - Label: "Branch from main"
   - Sublabel when OFF: `"Will branch from current HEAD"`
   - Sublabel when ON: `"Will branch from main"`
   - Default: OFF (branch from current HEAD)

4. **Agent picker**:
   - Only show "Orchestrate" and "Claude" (not "Note" — it's not useful for automated work)
   - Same button design as TaskDropModal's agent buttons

5. **Cancel button**: Closes modal, card stays in its original column

**Validation:**
- Check if workspace is a git repo via `window.git.isRepo(cwd)`. If not, show error and disable confirm.
- Check if branch name already exists. If so, show warning (could still allow proceeding if the worktree doesn't exist yet).

### 3. Wire the modal in KanbanNode

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx`

Render the modal when `worktreeDropPayload` is set:

```tsx
{worktreeDropPayload && (
  <WorktreeStartModal
    card={worktreeDropPayload.card}
    onConfirm={async (config) => {
      // 1. Create worktree
      const cwd = workspace?.path
      if (!cwd) return
      const baseBranch = config.branchFromMain ? 'main' : undefined
      const worktreePath = await window.git.worktreeAdd(cwd, config.branchName, baseBranch)

      // 2. Create canvas view
      const viewId = useViewStore.getState().createWorktreeView({
        worktreePath,
        branchName: config.branchName,
        sourceCardId: worktreeDropPayload.card.id,
      })

      // 3. Move card to "In Progress"
      // (call the normal move logic with sourceColId -> targetColId)
      moveCard(worktreeDropPayload.sourceColId, worktreeDropPayload.targetColId, worktreeDropPayload.card.id)

      // 4. Save card-agent mapping (for phase 05)
      // Store viewId + cardId association

      // 5. Close modal
      setWorktreeDropPayload(null)

      // Agent spawning happens in phase 04 — the view is created and active,
      // the next step creates the Claude node in it
    }}
    onClose={() => setWorktreeDropPayload(null)}
  />
)}
```

### 4. Extract `titleToBranchName` to a shared utility

**File:** `src/renderer/src/utils/branch.ts` (new file)

Move `titleToBranchName()` from `task-drop-modal.tsx` into a shared utility so both modals can use it:

```ts
export function titleToBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}
```

Update `task-drop-modal.tsx` to import from the shared utility instead of defining it locally.

### 5. Add `moveCard` helper to kanban store or component

The existing `onDropOnColumn` logic does the card move inline. Extract a reusable `moveCard(sourceColId, targetColId, cardId)` function so the modal's `onConfirm` can call it without duplicating the array manipulation.

**File:** `src/plugins/kanban/renderer/KanbanNode.tsx` or `src/plugins/kanban/store.ts`

Preferably add it to the kanban store so it's accessible from anywhere:

```ts
// In kanban store
moveCardToColumn: (boardId: string, cardId: string, sourceColId: string, targetColId: string) => void
```

This makes the card move from source column to target column (appended at the end).

## Acceptance Criteria

- Dropping a card on "In Progress" opens the WorktreeStartModal instead of immediately moving it
- The modal shows the card title, editable branch name, "branch from main" toggle, and agent picker
- Clicking an agent creates the worktree, opens a new canvas tab, and moves the card
- Clicking cancel closes the modal and the card stays where it was
- The modal validates that the workspace is a git repo before allowing confirm
- Dropping cards on other columns (BACKLOG, REVIEW, DONE) still works normally with no modal
