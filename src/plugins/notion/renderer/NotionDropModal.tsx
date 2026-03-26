import React, { useCallback } from 'react'
import { TaskDropModal, type TaskDropContext } from '../../../renderer/src/components/ui/task-drop-modal'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { getPreparedNotionExternalDrag, primeNotionExternalDrag, createNotionNoteFromDrop } from '../utils/notionDrag'

export interface NotionDropPayload {
  title: string
  pageId: string
  partition: string
  clientX: number
  clientY: number
}

interface Props {
  payload: NotionDropPayload
  onClose: () => void
}

export function NotionDropModal({ payload, onClose }: Props): React.ReactElement {
  const { title, pageId, partition, clientX, clientY } = payload

  const handleStartAgent = useCallback(async (agentId: string, ctx: TaskDropContext) => {
    if (agentId === 'orchestrate') {
      let markdown = ''
      const prepared = getPreparedNotionExternalDrag(partition, pageId)
      if (prepared) {
        markdown = prepared.markdown
      } else {
        try {
          const result = await primeNotionExternalDrag(partition, pageId, title)
          markdown = result.markdown
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
      await createNotionNoteFromDrop({ title, pageId, partition }, clientX, clientY)
      return
    }

    if (agentId === 'claude') {
      let text = title
      const prepared = getPreparedNotionExternalDrag(partition, pageId)
      if (prepared) {
        text = prepared.text
      } else {
        try {
          const result = await primeNotionExternalDrag(partition, pageId, title)
          text = result.text
        } catch {}
      }

      const newNode = useNodeStore.getState().add('claude', ctx.wx - 350, ctx.wy - 240, { cwd: ctx.cwd })
      const nodeId = newNode.id
      const capturedText = text
      setTimeout(() => { window.terminal.write(nodeId, capturedText + '\n') }, 1500)
    }
  }, [title, pageId, partition, clientX, clientY])

  return (
    <TaskDropModal
      sourceLabel="Task"
      payload={{ title, clientX, clientY }}
      onStartAgent={handleStartAgent}
      onClose={onClose}
    />
  )
}
