import React, { useCallback } from 'react'
import { TaskDropModal, type TaskDropContext } from '../../../renderer/src/components/ui/task-drop-modal'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { getPreparedTrelloExport, primeTrelloExport, createTrelloNoteFromDrop } from '../utils/trelloDrag'
import type { TrelloCard } from '../main/handlers'

export interface TrelloDropPayload {
  cardId: string
  title: string
  clientX: number
  clientY: number
  prefetchedCard: TrelloCard | null
  apiKey: string
  token: string
  partition: string
}

interface Props {
  payload: TrelloDropPayload
  onClose: () => void
}

export function TrelloDropModal({ payload, onClose }: Props): React.ReactElement {
  const { cardId, title, clientX, clientY, prefetchedCard, apiKey, token, partition } = payload

  const handleStartAgent = useCallback(async (agentId: string, ctx: TaskDropContext) => {
    if (agentId === 'orchestrate') {
      let markdown = title
      const prepared = getPreparedTrelloExport(cardId)
      if (prepared) {
        markdown = prepared.markdown
      } else if (apiKey && token) {
        try {
          const result = await primeTrelloExport(apiKey, token, cardId)
          markdown = result.markdown
        } catch {}
      } else {
        try {
          const card = await window.trello.fetchCardWithSession(partition, cardId)
          if (card.desc) markdown = `${card.name}\n\n${card.desc}`
        } catch {}
      }

      const node = useNodeStore.getState().add('orchestrator', ctx.wx, ctx.wy, {
        task: title, status: 'idle', subagentIds: [],
      })

      await window.orchestrator.start(node.id, {
        task: title, markdown, worldX: ctx.wx, worldY: ctx.wy, workspacePath: ctx.cwd,
      })
      return
    }

    if (agentId === 'note') {
      await createTrelloNoteFromDrop({ cardId, title }, clientX, clientY, prefetchedCard, apiKey, token, partition)
      return
    }

    if (agentId === 'claude' || agentId === 'codex') {
      let text = title
      const prepared = getPreparedTrelloExport(cardId)
      if (prepared) {
        text = prepared.text
      } else if (apiKey && token) {
        try {
          const result = await primeTrelloExport(apiKey, token, cardId)
          text = result.text
        } catch {}
      } else {
        try {
          const card = await window.trello.fetchCardWithSession(partition, cardId)
          if (card.desc) text = `${card.name}\n\n${card.desc}`
        } catch {}
      }

      const nodeType = agentId === 'codex' ? 'codex' : 'claude'
      const newNode = useNodeStore.getState().add(nodeType, ctx.wx - 350, ctx.wy - 240, { cwd: ctx.cwd })
      const nodeId = newNode.id
      const capturedText = text
      setTimeout(() => { window.terminal.write(nodeId, capturedText + '\n') }, 1500)
    }
  }, [cardId, title, clientX, clientY, prefetchedCard, apiKey, token, partition])

  return (
    <TaskDropModal
      sourceLabel="Trello Card"
      payload={{ title, clientX, clientY }}
      onStartAgent={handleStartAgent}
      onClose={onClose}
    />
  )
}
