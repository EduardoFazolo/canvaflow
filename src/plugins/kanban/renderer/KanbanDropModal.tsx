import React from 'react'
import { TaskDropModal, type TaskDropPayload } from '../../../renderer/src/components/ui/task-drop-modal'

export type KanbanDropPayload = TaskDropPayload

interface Props {
  payload: KanbanDropPayload
  onClose: () => void
}

export function KanbanDropModal({ payload, onClose }: Props): React.ReactElement {
  return (
    <TaskDropModal
      sourceLabel="Kanban Card"
      payload={payload}
      onClose={onClose}
    />
  )
}
