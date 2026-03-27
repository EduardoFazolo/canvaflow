/**
 * CoordinatorMount — mounts once on the canvas and wires up IPC events
 * from the main-process coordinator runner.
 *
 * Handles:
 * 1. Updating the orchestrator node's visual status during streaming
 * 2. Creating kanban cards in Backlog when the coordinator finishes
 * 3. Updating the original card as the epic/parent
 */
import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useKanbanStore } from '../../kanban/store'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import type { CoordinatorResultEvent, CoordinatorTaskDef } from '../shared/types'

/** Pending coordinator runs — maps coordinatorId → { cardId, workspaceId } */
const pendingRuns = new Map<string, { cardId: string; workspaceId: string }>()

export function registerCoordinatorRun(coordinatorId: string, cardId: string, workspaceId: string): void {
  pendingRuns.set(coordinatorId, { cardId, workspaceId })
}

/** Find the orchestrator node that has this coordinatorId in its props */
function findVizNode(coordinatorId: string) {
  const store = useNodeStore.getState()
  for (const node of store.nodes.values()) {
    if (node.type === 'orchestrator' && (node.props as any).coordinatorId === coordinatorId) {
      return node
    }
  }
  return null
}

/** Map coordinator status to orchestrator status */
function mapStatus(status: CoordinatorResultEvent['status']): string {
  switch (status) {
    case 'thinking': return 'thinking'
    case 'streaming': return 'streaming'
    case 'done': return 'done'
    case 'too_small': return 'done'
    case 'error': return 'error'
    default: return 'idle'
  }
}

export function CoordinatorMount(): null {
  useEffect(() => {
    const unsub = window.coordinatorPlanner.onStatus((event: CoordinatorResultEvent) => {
      // Update the orchestrator viz node for ALL status changes
      const vizNode = findVizNode(event.coordinatorId)
      if (vizNode) {
        useNodeStore.getState().update(vizNode.id, {
          props: {
            ...vizNode.props,
            status: mapStatus(event.status),
            message: event.message,
            ...(event.streamText !== undefined ? { streamText: event.streamText } : {}),
          },
        })
      }

      // Only write kanban cards when done with tasks
      if (event.status === 'done' && event.tasks?.length) {
        writeTasksToKanban(event)
      }
    })

    return () => unsub()
  }, [])

  return null
}

function writeTasksToKanban(event: CoordinatorResultEvent): void {
  const pending = pendingRuns.get(event.coordinatorId)
  if (!pending) return
  pendingRuns.delete(event.coordinatorId)

  const { cardId, workspaceId } = pending
  const store = useKanbanStore.getState()

  if (store.workspaceId !== workspaceId) return

  const state = store.state
  const board = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]
  if (!board) return

  const backlogCol = board.columns[0]
  if (!backlogCol) return

  const tasks = event.tasks!

  // Generate card IDs upfront
  const cardIds = tasks.map(() => nanoid(8))

  // Sort tasks by order first, then build cards with enumerated titles
  const sortedTasks = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const sortedCardIds = sortedTasks.map((_, i) => cardIds[i])

  // Build the new cards with enumerated titles
  const newCards = sortedTasks.map((task: CoordinatorTaskDef, i: number) => {
    const originalIndex = tasks.indexOf(task)
    const dependsOn = task.dependsOnIndices
      .filter((idx) => idx >= 0 && idx < tasks.length && idx !== originalIndex)
      .map((idx) => {
        const depTask = tasks[idx]
        const sortedIdx = sortedTasks.indexOf(depTask)
        return sortedIdx >= 0 ? sortedCardIds[sortedIdx] : null
      })
      .filter((id): id is string => id !== null)

    let desc = task.description
    if (task.files && task.files.length > 0) {
      desc += `\n\nFiles: ${task.files.join(', ')}`
    }

    return {
      id: sortedCardIds[i],
      title: `${i + 1}. ${task.title}`,
      description: desc.slice(0, 500),
      order: i + 1,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      parentCardId: cardId,
    }
  })

  // Update kanban state: add cards to backlog, update original card as epic
  const updatedColumns = board.columns.map((col) => {
    if (col.id === backlogCol.id) {
      return { ...col, cards: [...col.cards, ...newCards] }
    }
    const epicIdx = col.cards.findIndex((c) => c.id === cardId)
    if (epicIdx !== -1) {
      const epic = col.cards[epicIdx]
      const planSummary = newCards
        .map((c) => c.title)
        .join('\n')
      const updatedEpic = {
        ...epic,
        description: `Plan:\n${planSummary}${epic.description ? `\n\n${epic.description}` : ''}`,
      }
      const updatedCards = [...col.cards]
      updatedCards[epicIdx] = updatedEpic
      return { ...col, cards: updatedCards }
    }
    return col
  })

  store.setState({
    ...state,
    boards: state.boards.map((b) =>
      b.id === board.id ? { ...b, columns: updatedColumns } : b,
    ),
  })
}
