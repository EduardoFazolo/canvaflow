import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BRIDGE_URL = 'http://127.0.0.1:7824'

const server = new Server(
  { name: 'canvaflow', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_task',
      description:
        'Retrieve your assigned task from CanvaFlow. Returns the full task payload ' +
        'including title, description, workspace path, branch name, agent type, and ' +
        'coordination rules (if part of a multi-agent cluster). ' +
        'Call this at the start of your session to understand what you need to do.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: {
            type: 'string',
            description: 'The task ID assigned to this agent session',
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'update_task_status',
      description:
        'Update the status of your task in CanvaFlow. Use this to report progress ' +
        'and results back to the canvas. Statuses: "in_progress" when you start working, ' +
        '"completed" when done (include a result summary), "failed" if you cannot complete it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          task_id: {
            type: 'string',
            description: 'The task ID to update',
          },
          status: {
            type: 'string',
            enum: ['in_progress', 'completed', 'failed'],
            description: 'The new status',
          },
          result: {
            type: 'string',
            description: 'Summary of what was accomplished or why it failed. Required for completed/failed.',
          },
        },
        required: ['task_id', 'status'],
      },
    },
    {
      name: 'list_siblings',
      description:
        'List all sibling tasks in your orchestrator cluster. Use this to understand ' +
        'what other agents are working on in parallel, so you can avoid file conflicts ' +
        'and coordinate effectively. Only relevant if your task has an orchestratorId.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          orchestrator_id: {
            type: 'string',
            description: 'The orchestrator ID that owns this cluster of tasks',
          },
        },
        required: ['orchestrator_id'],
      },
    },
  ],
}))

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'get_task') {
    const { task_id } = args as { task_id: string }
    if (!task_id?.trim()) {
      return { content: [{ type: 'text', text: 'Error: task_id is required' }], isError: true }
    }

    try {
      const response = await fetch(`${BRIDGE_URL}/task/${encodeURIComponent(task_id)}`)
      const data = await response.json() as { ok: boolean; task?: Record<string, unknown>; error?: string }

      if (!data.ok) {
        return { content: [{ type: 'text', text: `Error: ${data.error}` }], isError: true }
      }

      const task = data.task!
      const lines: string[] = [
        `# Task: ${task.title}`,
        '',
      ]

      if (task.description) lines.push(`## Description\n${task.description}\n`)
      if (task.workspacePath) lines.push(`**Workspace:** ${task.workspacePath}`)
      if (task.branchName) lines.push(`**Branch:** ${task.branchName}`)
      if (task.agentType) lines.push(`**Agent type:** ${task.agentType}`)
      if (task.status) lines.push(`**Status:** ${task.status}`)

      if (task.coordinationRules) {
        try {
          const rules = JSON.parse(task.coordinationRules as string)
          lines.push('\n## Coordination Rules')
          if (rules.systemPrompt) lines.push(rules.systemPrompt)
          if (rules.siblings && Array.isArray(rules.siblings)) {
            lines.push('\n### Sibling tasks (running in parallel):')
            for (const sib of rules.siblings) {
              lines.push(`- **${sib.title}**: ${sib.description ?? sib.task ?? '(no description)'}`)
            }
          }
        } catch {
          lines.push(`\n## Coordination Rules\n${task.coordinationRules}`)
        }
      }

      if (task.orchestratorId) {
        lines.push(`\n**Orchestrator ID:** ${task.orchestratorId} (use list_siblings to see other tasks)`)
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] }
    } catch {
      return {
        content: [{ type: 'text', text: 'Could not reach CanvaFlow. Make sure the app is running.' }],
        isError: true,
      }
    }
  }

  if (name === 'update_task_status') {
    const { task_id, status, result } = args as { task_id: string; status: string; result?: string }

    if (!task_id?.trim() || !status?.trim()) {
      return { content: [{ type: 'text', text: 'Error: task_id and status are required' }], isError: true }
    }

    try {
      const body: Record<string, string> = { status }
      if (result) body.result = result

      const response = await fetch(`${BRIDGE_URL}/task/${encodeURIComponent(task_id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json() as { ok: boolean; error?: string }

      if (!data.ok) {
        return { content: [{ type: 'text', text: `Error: ${data.error}` }], isError: true }
      }

      return { content: [{ type: 'text', text: `Task ${task_id} status updated to "${status}".` }] }
    } catch {
      return {
        content: [{ type: 'text', text: 'Could not reach CanvaFlow. Make sure the app is running.' }],
        isError: true,
      }
    }
  }

  if (name === 'list_siblings') {
    const { orchestrator_id } = args as { orchestrator_id: string }

    if (!orchestrator_id?.trim()) {
      return { content: [{ type: 'text', text: 'Error: orchestrator_id is required' }], isError: true }
    }

    try {
      const response = await fetch(`${BRIDGE_URL}/siblings/${encodeURIComponent(orchestrator_id)}`)
      const data = await response.json() as { ok: boolean; tasks?: Array<Record<string, unknown>>; error?: string }

      if (!data.ok) {
        return { content: [{ type: 'text', text: `Error: ${data.error}` }], isError: true }
      }

      const tasks = data.tasks!
      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No sibling tasks found for this orchestrator.' }] }
      }

      const lines = tasks.map((t) =>
        `- **${t.title}** (${t.status}) — ${t.description ?? '(no description)'}`,
      )

      return {
        content: [{
          type: 'text',
          text: `## Sibling tasks (${tasks.length})\n\n${lines.join('\n')}`,
        }],
      }
    } catch {
      return {
        content: [{ type: 'text', text: 'Could not reach CanvaFlow. Make sure the app is running.' }],
        isError: true,
      }
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport()
await server.connect(transport)
