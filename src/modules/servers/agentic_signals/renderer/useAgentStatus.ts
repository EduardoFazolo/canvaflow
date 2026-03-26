import { useEffect } from 'react'
import { useNodeStore } from '../../../../renderer/src/stores/nodeStore'
import { useViewStore } from '../../../../renderer/src/stores/viewStore'
import { useKanbanStore } from '../../../../plugins/kanban/store'
import { logAgentDebug, summarizeText } from '../shared/debug'

export function useAgentStatus(): void {
  useEffect(() => {
    return window.agent?.onStatus((signal) => {
      logAgentDebug('renderer-hook', 'received-agent-status', {
        nodeId: signal.nodeId,
        status: signal.status,
        message: signal.message ? summarizeText(signal.message) : '',
      })
      useNodeStore.getState().setAgentStatus(signal.nodeId, signal.status, signal.message)

      // Update worktree view tab status indicator
      const view = useViewStore.getState().getViewByNodeId(signal.nodeId)
      if (view) {
        useViewStore.getState().updateAgentStatus(view.id, signal.status)

        // Auto-move kanban card to REVIEW when agent is done
        if (signal.status === 'done' && view.sourceCardId) {
          moveCardToReview(view.sourceCardId)
          window.coordinator.unregister(signal.nodeId)
        }

        if (signal.status === 'error') {
          window.coordinator.unregister(signal.nodeId)
        }
      }
    })
  }, [])
}

function moveCardToReview(cardId: string): void {
  const { state, setState } = useKanbanStore.getState()

  for (const board of state.boards) {
    // Find the card's current column
    const currentCol = board.columns.find((c) => c.cards.some((card) => card.id === cardId))
    if (!currentCol) continue

    // Find the "REVIEW" column
    const reviewCol = board.columns.find((c) => c.title.toUpperCase() === 'REVIEW')
    if (!reviewCol) continue
    if (currentCol.id === reviewCol.id) return // already in review

    const card = currentCol.cards.find((c) => c.id === cardId)
    if (!card) continue

    const newColumns = board.columns.map((col) => {
      if (col.id === currentCol.id) {
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
      }
      if (col.id === reviewCol.id) {
        return { ...col, cards: [...col.cards, card] }
      }
      return col
    })

    setState({
      ...state,
      boards: state.boards.map((b) =>
        b.id === board.id ? { ...b, columns: newColumns } : b,
      ),
    })
    return
  }
}
