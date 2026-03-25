/**
 * OrchestratorV2Mount — mounts once on the canvas and wires up IPC events
 * from the main-process orchestrator-v2 runner into the node store.
 */
import React, { useEffect } from 'react'
import { useNodeStore } from '../../renderer/src/stores/nodeStore'
import type {
  RepoAgentSpawnedEvent,
  OrcV2StatusEvent,
  OrcV2NoteEvent,
  AgentCommitEvent,
  ConflictDetectedEvent,
  MergeProgressEvent,
} from './shared/types'
import type { AgentFileChange } from '../../modules/servers/agentic_signals/shared/types'

export function OrchestratorV2Mount(): React.ReactElement | null {
  useEffect(() => {
    // Agent spawned → create RepoAgentNode
    const unsubAgents = window.orcv2.onAgentSpawned((event: RepoAgentSpawnedEvent) => {
      const store = useNodeStore.getState()

      const agentNode = store.add('repo-agent', event.worldX, event.worldY, {
        task: event.task,
        branch: event.branch,
        repoPath: event.repoPath,
        colorIndex: event.colorIndex,
        orchestratorId: event.orchestratorId,
        note: undefined,
        commits: [],
        conflictWarning: undefined,
      })
      store.update(agentNode.id, {
        title: event.title,
        props: { ...agentNode.props, agentId: event.agentId },
      })

      // Add to orchestrator's agentIds
      const orchNode = store.nodes.get(event.orchestratorId)
      if (orchNode) {
        const existing = (orchNode.props.agentIds as string[] | undefined) ?? []
        store.update(event.orchestratorId, {
          props: { ...orchNode.props, agentIds: [...existing, agentNode.id] },
        })
      }
    })

    // Status updates
    const unsubStatus = window.orcv2.onStatus((event: OrcV2StatusEvent) => {
      const store = useNodeStore.getState()
      const node = store.nodes.get(event.orchestratorId)
      if (!node) return
      store.update(event.orchestratorId, {
        props: {
          ...node.props,
          status: event.status,
          message: event.message,
          ...(event.streamText !== undefined ? { streamText: event.streamText } : {}),
        },
      })
    })

    // Notes to agents
    const unsubNotes = window.orcv2.onNoteUpdate((event: OrcV2NoteEvent) => {
      const store = useNodeStore.getState()
      for (const node of store.nodes.values()) {
        if ((node.type === 'repo-agent' || node.type === 'claude') &&
            (node.props as any).agentId === event.agentId) {
          store.update(node.id, { props: { ...node.props, note: event.note } })
          break
        }
      }
    })

    // Commit tracking
    const unsubCommits = window.orcv2.onAgentCommit((event: AgentCommitEvent) => {
      const store = useNodeStore.getState()

      // Update orchestrator's commits list
      const orchNode = store.nodes.get(event.orchestratorId)
      if (orchNode) {
        const existing = (orchNode.props.commits as any[] | undefined) ?? []
        store.update(event.orchestratorId, {
          props: {
            ...orchNode.props,
            commits: [...existing, {
              agentId: event.agentId,
              hash: event.hash,
              message: event.message,
              filesChanged: event.filesChanged,
              timestamp: event.timestamp,
            }],
          },
        })
      }

      // Update the agent node's commits
      for (const node of store.nodes.values()) {
        if ((node.props as any).agentId === event.agentId) {
          const nodeCommits = (node.props.commits as any[] | undefined) ?? []
          store.update(node.id, {
            props: {
              ...node.props,
              commits: [...nodeCommits, {
                hash: event.hash,
                message: event.message,
                timestamp: event.timestamp,
              }],
            },
          })
          break
        }
      }
    })

    // Conflict detection
    const unsubConflicts = window.orcv2.onConflictDetected((event: ConflictDetectedEvent) => {
      const store = useNodeStore.getState()

      // Update orchestrator's conflicts list
      const orchNode = store.nodes.get(event.orchestratorId)
      if (orchNode) {
        const existing = (orchNode.props.conflicts as any[] | undefined) ?? []
        // Deduplicate
        const key = `${event.targetAgentId}:${event.sourceAgentId}`
        if (!existing.some((c: any) => `${c.targetAgentId}:${c.sourceAgentId}` === key)) {
          store.update(event.orchestratorId, {
            props: {
              ...orchNode.props,
              conflicts: [...existing, {
                targetAgentId: event.targetAgentId,
                sourceAgentId: event.sourceAgentId,
                conflictingFiles: event.conflictingFiles,
              }],
            },
          })
        }
      }

      // Set conflict warning on the target agent node
      for (const node of store.nodes.values()) {
        if ((node.props as any).agentId === event.targetAgentId) {
          store.update(node.id, {
            props: { ...node.props, conflictWarning: event.instruction },
          })
          break
        }
      }
    })

    // Merge progress
    const unsubMerge = window.orcv2.onMergeProgress((event: MergeProgressEvent) => {
      const store = useNodeStore.getState()
      const orchNode = store.nodes.get(event.orchestratorId)
      if (!orchNode) return

      const existing = (orchNode.props.mergeProgress as MergeProgressEvent[] | undefined) ?? []
      // Replace if same agent, otherwise append
      const idx = existing.findIndex((m) => m.agentId === event.agentId)
      const updated = [...existing]
      if (idx >= 0) {
        updated[idx] = event
      } else {
        updated.push(event)
      }
      store.update(event.orchestratorId, {
        props: { ...orchNode.props, mergeProgress: updated },
      })
    })

    // File changes from agents
    const unsubFileChanges = window.agent.onFileChange((event: AgentFileChange & { orchestratorId: string }) => {
      const store = useNodeStore.getState()
      const orchNode = store.nodes.get(event.orchestratorId)
      if (!orchNode || orchNode.type !== 'orchestrator-v2') return

      // Pass through — the commit polling handles the main tracking
    })

    return () => {
      unsubAgents()
      unsubStatus()
      unsubNotes()
      unsubCommits()
      unsubConflicts()
      unsubMerge()
      unsubFileChanges()
    }
  }, [])

  return null
}
