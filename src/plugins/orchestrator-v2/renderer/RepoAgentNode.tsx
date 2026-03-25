import React, { useCallback, useRef, useEffect } from 'react'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import type { NodeData } from '../../../renderer/src/stores/nodeStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'
import { AGENT_COLORS } from '../shared/types'

interface RepoAgentProps {
  task: string
  branch: string
  repoPath: string
  colorIndex: number
  orchestratorId?: string
  note?: string
  commits?: Array<{ hash: string; message: string; timestamp: number }>
  conflictWarning?: string
}

interface Props {
  node: NodeData
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''")
}

/**
 * Build the system prompt for the agent. The user prompt (task) is handled
 * separately via a file — see handleLaunchClaude.
 */
function buildSystemPrompt(
  myTask: string,
  branch: string,
  repoPath: string,
  orchestratorNode: NodeData | undefined,
): string {
  if (!orchestratorNode) return ''

  const mainTask = (orchestratorNode.props.task as string) ?? ''
  const agentIds = (orchestratorNode.props.agentIds as string[] | undefined) ?? []
  const store = useNodeStore.getState()

  const siblingTasks: string[] = []
  for (const id of agentIds) {
    const node = store.nodes.get(id)
    if (!node) continue
    const nodeTask = (node.props?.task as string) ?? ''
    const nodeTitle = node.title ?? ''
    const nodeBranch = (node.props?.branch as string) ?? ''
    siblingTasks.push(`- "${nodeTitle}" (branch: ${nodeBranch}): ${nodeTask}`)
  }

  return [
    `You are part of a multi-agent cluster working on: "${mainTask}"`,
    `You are working in your OWN CLONE of the repository at: ${repoPath}`,
    `Your branch: ${branch}`,
    ``,
    `Other agents are working IN PARALLEL on these tasks (each in their own repo clone):`,
    ...siblingTasks,
    ``,
    `COORDINATION RULES:`,
    `1. ONLY modify files directly related to YOUR task.`,
    `2. COMMIT FREQUENTLY — the orchestrator monitors your commits to track progress and detect conflicts.`,
    `3. If you receive a note about conflicts, follow the rebase instructions carefully.`,
    `4. Prefer ADDING new files over modifying existing shared ones when possible.`,
    `5. Keep changes minimal and focused on your specific task.`,
    `6. When done, provide a brief summary of which files you created or modified.`,
  ].join('\n')
}

export function RepoAgentNode({ node }: Props): React.ReactElement {
  const { add, remove, update } = useNodeStore()
  const props = node.props as Partial<RepoAgentProps>
  const task = props.task ?? ''
  const branch = props.branch ?? ''
  const repoPath = props.repoPath ?? ''
  const colorIndex = props.colorIndex ?? 0
  const orchestratorId = props.orchestratorId
  const note = props.note
  const commits = props.commits ?? []
  const conflictWarning = props.conflictWarning
  const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]
  const commitsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (commitsRef.current) commitsRef.current.scrollTop = commitsRef.current.scrollHeight
  }, [commits.length])

  const handleLaunchClaude = useCallback(async () => {
    const orchNode = orchestratorId
      ? useNodeStore.getState().nodes.get(orchestratorId)
      : undefined
    const systemPrompt = buildSystemPrompt(task, branch, repoPath, orchNode)

    // Write the user prompt to a file so we can pass it via $(cat ...) —
    // this avoids ALL terminal.write timing issues and shell escaping problems.
    const promptFilePath = repoPath + '/.orcv2-prompt.txt'
    const systemPromptFilePath = repoPath + '/.orcv2-system-prompt.txt'
    await window.fs.writeFile(promptFilePath, task)
    if (systemPrompt) {
      await window.fs.writeFile(systemPromptFilePath, systemPrompt)
    }

    // Build flags: read prompt from file via $(cat ...) so shell handles escaping
    const flags = [
      '--dangerously-skip-permissions',
      systemPrompt ? `--append-system-prompt "$(cat '${shellEscape(systemPromptFilePath)}')"` : '',
      `"$(cat '${shellEscape(promptFilePath)}')"`,
    ].filter(Boolean).join(' ')

    const newNode = add('claude', node.x, node.y, {
      cwd: repoPath,
      claudeFlags: flags,
    })

    if (orchestratorId) {
      const store = useNodeStore.getState()
      const orchNode2 = store.nodes.get(orchestratorId)
      if (orchNode2) {
        const agentIds = (orchNode2.props.agentIds as string[] | undefined) ?? []
        const updated = agentIds.map((id) => (id === node.id ? newNode.id : id))
        store.update(orchestratorId, {
          props: { ...orchNode2.props, agentIds: updated },
        })
      }
      window.orcv2.registerNode(newNode.id, orchestratorId)
    }

    update(newNode.id, {
      props: {
        ...newNode.props,
        orchestratorId,
        task,
        branch,
        repoPath,
        colorIndex,
        cwd: repoPath,
        claudeFlags: flags,
      },
    })

    useActivationStore.getState().activate(newNode.id)
    remove(node.id)
  }, [node.id, node.x, node.y, task, branch, repoPath, colorIndex, orchestratorId, add, remove, update])

  const titleExtra = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color, flexShrink: 0,
        boxShadow: `0 0 5px ${color}`,
      }} />
    </div>
  )

  return (
    <BaseNode node={node} titleExtra={titleExtra}>
      <div style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        borderTop: `2px solid ${color}40`,
      }}>
        {/* Branch badge */}
        <div style={{
          padding: '8px 14px 0',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill={color} opacity={0.6}>
            <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 9.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm7.5-9.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zM4.25 5.5a1.75 1.75 0 1 0-.25-3.48V1H3v1.02a1.75 1.75 0 1 0-.25 3.48v4a1.75 1.75 0 1 0 .5 0v-4zM11 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM4 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM4 12a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/>
          </svg>
          <span style={{
            fontSize: 11, fontFamily: 'monospace',
            color, fontWeight: 600, opacity: 0.8,
          }}>
            {branch}
          </span>
        </div>

        {/* Repo path */}
        <div style={{
          padding: '4px 14px 0',
          fontSize: 10, fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.25)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {repoPath.split('/').slice(-3).join('/')}
        </div>

        {/* Task description */}
        <div style={{
          flex: 1, padding: '10px 14px',
          overflow: 'auto',
          fontSize: 12, color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.55,
        }}>
          {task}
        </div>

        {/* Conflict warning */}
        {conflictWarning && (
          <div style={{
            margin: '0 10px 8px',
            padding: '7px 10px',
            background: 'rgba(248,113,113,0.07)',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.2)',
            fontSize: 11, color: 'rgba(248,113,113,0.8)',
            lineHeight: 1.5,
          }}>
            {conflictWarning}
          </div>
        )}

        {/* Live note from orchestrator */}
        {note && (
          <div style={{
            margin: '0 10px 8px',
            padding: '7px 10px',
            background: `${color}0D`,
            borderRadius: 6,
            border: `1px solid ${color}25`,
            fontSize: 11, color: `${color}CC`,
            lineHeight: 1.5,
          }}>
            {note}
          </div>
        )}

        {/* Recent commits */}
        {commits.length > 0 && (
          <div style={{ padding: '0 10px 8px' }}>
            <div style={{
              fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
            }}>Commits</div>
            <div
              ref={commitsRef}
              style={{
                display: 'flex', flexDirection: 'column', gap: 1,
                maxHeight: 80, overflow: 'auto',
              }}
            >
              {commits.slice(-5).map((c, i) => (
                <div key={i} style={{
                  fontSize: 10, fontFamily: 'monospace',
                  color: 'rgba(255,255,255,0.4)',
                  display: 'flex', gap: 5,
                }}>
                  <span style={{ color: `${color}99`, flexShrink: 0 }}>{c.hash.slice(0, 7)}</span>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Launch Claude button */}
        <div style={{ padding: '0 10px 10px' }}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleLaunchClaude}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 6,
              background: `${color}18`,
              border: `1px solid ${color}40`,
              color: `${color}DD`,
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
              background: `${color}28`,
              borderColor: `${color}60`,
            })}
            onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
              background: `${color}18`,
              borderColor: `${color}40`,
            })}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
            </svg>
            Launch Claude
          </button>
        </div>
      </div>
    </BaseNode>
  )
}
