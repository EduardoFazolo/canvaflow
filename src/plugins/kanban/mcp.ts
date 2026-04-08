/**
 * Kanban MCP handler — listens for `canvaflow-mcp:kanban-add-tasks` events
 * from the HTTP bridge and mutates the kanban store on the current canvas.
 *
 * Semantics (matching the `add_kanban_tasks` MCP tool contract):
 *   1. Determine the active canvas ID from the node store.
 *   2. If no kanban node is present on that canvas, spawn one near the
 *      viewport center so the user can see the tasks being added.
 *   3. Ensure the kanban store is loaded for the active workspace.
 *   4. For each task: if a card with the same title already exists anywhere
 *      in the active board, skip it — never edit or remove existing cards.
 *      Otherwise append a new card to the first column (BACKLOG by default).
 */

import { nanoid } from 'nanoid'
import { useNodeStore } from '../../renderer/src/stores/nodeStore'
import { useCameraStore } from '../../renderer/src/stores/cameraStore'
import { useKanbanStore, type KanbanCard } from './store'

let initialized = false

export function initKanbanMcpIpc(): void {
  if (initialized) return
  initialized = true

  window.canvaflowMcp.onAddKanbanTasks(async (tasks) => {
    if (!Array.isArray(tasks) || tasks.length === 0) return

    const nodeStore = useNodeStore.getState()
    const workspaceId = nodeStore.activeWorkspaceId
    if (!workspaceId) {
      console.warn('[canvaflow-mcp] add_kanban_tasks: no active canvas')
      return
    }

    // 1. Ensure the kanban store is loaded for this workspace BEFORE we
    //    potentially spawn a kanban node. If we spawn first, the freshly
    //    mounted KanbanNode's own `load` useEffect races with ours — the
    //    late-arriving `set({ state: default })` would clobber our newly
    //    appended cards. Loading first makes the node's load a no-op.
    const ks = useKanbanStore.getState()
    if (!ks.loaded || ks.workspaceId !== workspaceId) {
      await ks.load(workspaceId)
    }

    // 2. Ensure a kanban node exists on the current canvas
    const existingKanbanNode = Array.from(nodeStore.nodes.values()).find(
      (n) => n.type === 'kanban',
    )
    if (!existingKanbanNode) {
      const camera = useCameraStore.getState().camera
      // Place roughly at the viewport center in world coordinates
      const cx = (-camera.x + window.innerWidth * 0.5) / camera.zoom
      const cy = (-camera.y + window.innerHeight * 0.5) / camera.zoom
      // Offset by half the default kanban size so it centers under the cursor
      useNodeStore.getState().add('kanban', cx - 490, cy - 280)
    }

    const state = useKanbanStore.getState().state
    const activeBoard =
      state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]
    if (!activeBoard || activeBoard.columns.length === 0) {
      console.warn('[canvaflow-mcp] add_kanban_tasks: active board has no columns')
      return
    }

    // 3. Gather existing titles across the whole board for dedup
    const existingTitles = new Set<string>()
    for (const col of activeBoard.columns) {
      for (const card of col.cards) existingTitles.add(card.title)
    }

    // 4. Filter out duplicates and build new cards
    const newCards: KanbanCard[] = []
    for (const task of tasks) {
      if (!task || typeof task.title !== 'string' || task.title.length === 0) continue
      if (existingTitles.has(task.title)) continue
      existingTitles.add(task.title) // also dedup within the incoming batch
      newCards.push({
        id: nanoid(8),
        title: task.title,
        description: task.description,
      })
    }

    if (newCards.length === 0) return

    // 5. Append to the first column and persist
    const firstColumnId = activeBoard.columns[0].id
    const updatedColumns = activeBoard.columns.map((c) =>
      c.id === firstColumnId ? { ...c, cards: [...c.cards, ...newCards] } : c,
    )
    const updatedBoard = { ...activeBoard, columns: updatedColumns }
    useKanbanStore.getState().setState({
      ...state,
      boards: state.boards.map((b) => (b.id === activeBoard.id ? updatedBoard : b)),
    })
  })
}
