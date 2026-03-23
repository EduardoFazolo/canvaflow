/**
 * OrchestratorMount — mounts once on the canvas and wires up IPC events
 * from the main-process orchestrator runner into the node store.
 */
import React, { useEffect } from 'react'
import { useNodeStore } from '../../renderer/src/stores/nodeStore'
import type { SubagentSpawnedEvent, OrchestratorStatusEvent, OrchestratorStreamEvent, NoteUpdateEvent } from './shared/types'

export function OrchestratorMount(): React.ReactElement | null {
  useEffect(() => {
    const unsubNodes = window.orchestrator.onNodeCreated((event: SubagentSpawnedEvent) => {
      const store = useNodeStore.getState()

      // Create the SubagentNode
      const subagent = store.add('subagent', event.worldX, event.worldY, {
        task: event.task,
        orchestratorId: event.orchestratorId,
        note: undefined,
      })
      // Override the auto-generated id so the orchestrator can reference it
      // (we use the id from the event so the runner knows it)
      // Since add() generates its own id, we store the event agentId in props
      // and also update the orchestrator node's subagentIds list
      store.update(subagent.id, {
        title: event.title,
        props: { ...subagent.props, agentId: event.agentId },
      })

      // Add this subagent's id to the orchestrator node's subagentIds list
      const orchestratorNode = store.nodes.get(event.orchestratorId)
      if (orchestratorNode) {
        const existing = (orchestratorNode.props.subagentIds as string[] | undefined) ?? []
        store.update(event.orchestratorId, {
          props: {
            ...orchestratorNode.props,
            subagentIds: [...existing, subagent.id],
          },
        })
      }
    })

    const unsubStatus = window.orchestrator.onStatus((event: OrchestratorStatusEvent) => {
      const store = useNodeStore.getState()
      const node = store.nodes.get(event.orchestratorId)
      if (!node) return
      store.update(event.orchestratorId, {
        props: {
          ...node.props,
          status: event.status,
          message: event.message,
        },
      })
    })

    const unsubStream = window.orchestrator.onStream((event: OrchestratorStreamEvent) => {
      const store = useNodeStore.getState()
      const node = store.nodes.get(event.orchestratorId)
      if (!node) return
      store.update(event.orchestratorId, {
        props: { ...node.props, streamText: event.text },
      })
    })

    const unsubNotes = window.orchestrator.onNoteUpdate((event: NoteUpdateEvent) => {
      const store = useNodeStore.getState()
      // Find subagent node by its agentId prop
      for (const node of store.nodes.values()) {
        if (node.type === 'subagent' && (node.props as any).agentId === event.agentId) {
          store.update(node.id, { props: { ...node.props, note: event.note } })
          break
        }
      }
    })

    return () => {
      unsubNodes()
      unsubStatus()
      unsubStream()
      unsubNotes()
    }
  }, [])

  return null
}
