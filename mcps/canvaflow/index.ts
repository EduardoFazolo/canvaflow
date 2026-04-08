/**
 * CanvaFlow MCP Server
 *
 * Stdio-based MCP server spawned by Claude Code. Exposes tools that let
 * agents interact with the CanvaFlow app through the HTTP bridge running
 * in the Electron main process.
 *
 * Tools are organized by domain. Currently:
 *   - Code Review: add_review_comment
 *
 * To add a new tool:
 *   1. Define it in TOOLS
 *   2. Add its handler in handleToolCall
 *   3. Add the corresponding HTTP endpoint in the bridge (server.ts)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BRIDGE_URL = 'http://127.0.0.1:7824'

// ---------------------------------------------------------------------------
// Types (mirrored from shared/types.ts — MCP server can't import from src/)
// ---------------------------------------------------------------------------

interface ReviewComment {
  file: string
  line: number
  severity: 'critical' | 'warning' | 'nit'
  message: string
}

interface KanbanTask {
  title: string
  description?: string
}

interface BridgeResponse {
  ok: boolean
  error?: string
  count?: number
}

// ---------------------------------------------------------------------------
// Bridge communication
// ---------------------------------------------------------------------------

async function bridgePost(path: string, body: unknown): Promise<BridgeResponse> {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await response.json()) as BridgeResponse
}

function bridgeError(context: string): { content: Array<{ type: string; text: string }>; isError: true } {
  return {
    content: [{
      type: 'text',
      text: `Could not reach CanvaFlow (${context}). Make sure the app is running.`,
    }],
    isError: true,
  }
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

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
      name: 'add_review_comment',
      description:
        'Add a code review comment to the CanvaFlow Code Review view. ' +
        'Call this for each issue you find during a code review. ' +
        'The comment will appear inline in the diff view at the specified file and line.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          review_id: {
            type: 'string',
            description: 'The review ID. Use the CANVAFLOW_REVIEW_ID environment variable.',
          },
          file: {
            type: 'string',
            description: 'Relative file path (e.g. "src/main/index.ts")',
          },
          line: {
            type: 'number',
            description: 'Line number in the modified file (1-based)',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'warning', 'nit'],
            description: 'Severity: critical (bugs, security), warning (code smells, performance), nit (style, naming)',
          },
          message: {
            type: 'string',
            description: 'The review comment explaining the issue and suggesting a fix',
          },
        },
        required: ['review_id', 'file', 'line', 'severity', 'message'],
      },
    },
    {
      name: 'batch_review_comments',
      description:
        'Add multiple code review comments at once. More efficient than calling ' +
        'add_review_comment repeatedly. Use this when you have several findings to report.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          review_id: {
            type: 'string',
            description: 'The review ID. Use the CANVAFLOW_REVIEW_ID environment variable.',
          },
          comments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string', description: 'Relative file path' },
                line: { type: 'number', description: 'Line number (1-based)' },
                severity: { type: 'string', enum: ['critical', 'warning', 'nit'] },
                message: { type: 'string', description: 'The review comment' },
              },
              required: ['file', 'line', 'severity', 'message'],
            },
            description: 'Array of review comments',
          },
        },
        required: ['review_id', 'comments'],
      },
    },
    {
      name: 'reply_to_review_thread',
      description:
        'Reply to an existing review thread. Use this when the user routes a review ' +
        'comment to you and asks you to respond. The reply is appended to the thread ' +
        'so the user, the original reviewer, and any other agents can see the full ' +
        'conversation. The thread_id is given to you in the routed message — pass it ' +
        'back exactly as received.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          thread_id: {
            type: 'string',
            description: 'The thread ID to reply to (provided by the user / system in the routed message)',
          },
          body: {
            type: 'string',
            description: 'Your reply. Markdown is supported (code spans, bold, italic).',
          },
          author_name: {
            type: 'string',
            description: 'Optional display name shown next to your reply (e.g. "Claude (main)"). Defaults to "Agent".',
          },
        },
        required: ['thread_id', 'body'],
      },
    },
    {
      name: 'add_kanban_tasks',
      description:
        'Batch-add tasks to the kanban board on the current CanvaFlow canvas. ' +
        'If a kanban node is already open on the active canvas, its active board is used; ' +
        'otherwise a new kanban node is created. Each task is added as a card in the first ' +
        'column (e.g. BACKLOG). Tasks whose title already exists anywhere in the active ' +
        'board are silently skipped — this tool never edits or removes existing cards.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Card title — also used as the dedup key' },
                description: { type: 'string', description: 'Optional longer description shown when the card is expanded' },
              },
              required: ['title'],
            },
            description: 'Array of tasks to add',
          },
        },
        required: ['tasks'],
      },
    },
  ],
}))

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'add_review_comment') {
    const { review_id, file, line, severity, message } = args as {
      review_id: string; file: string; line: number; severity: string; message: string
    }

    try {
      const result = await bridgePost('/review/comments', {
        reviewId: review_id,
        authorNodeId: process.env.CANVAFLOW_NODE_ID ?? null,
        comments: [{ file, line, severity, message }],
      })

      if (!result.ok) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      }

      return {
        content: [{ type: 'text', text: `Review comment added: [${severity}] ${file}:${line}` }],
      }
    } catch {
      return bridgeError('add_review_comment')
    }
  }

  if (name === 'reply_to_review_thread') {
    const { thread_id, body, author_name } = args as {
      thread_id: string; body: string; author_name?: string
    }

    if (!thread_id || !body) {
      return {
        content: [{ type: 'text', text: 'Error: thread_id and body are required' }],
        isError: true,
      }
    }

    try {
      // CANVAFLOW_NODE_ID is set by the PTY spawner — claude inherits it,
      // and we (the MCP server) inherit it from claude. Pass it through so
      // the renderer can map the reply back to a specific agent node and
      // surface a "jump to agent" affordance.
      const nodeId = process.env.CANVAFLOW_NODE_ID ?? null

      const result = await bridgePost('/review/reply', {
        threadId: thread_id,
        body,
        authorName: author_name ?? 'Agent',
        authorRole: 'agent',
        authorNodeId: nodeId,
      })

      if (!result.ok) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      }

      return {
        content: [{ type: 'text', text: `Reply posted to thread ${thread_id}.` }],
      }
    } catch {
      return bridgeError('reply_to_review_thread')
    }
  }

  if (name === 'batch_review_comments') {
    const { review_id, comments } = args as {
      review_id: string; comments: ReviewComment[]
    }

    try {
      const result = await bridgePost('/review/comments', {
        reviewId: review_id,
        authorNodeId: process.env.CANVAFLOW_NODE_ID ?? null,
        comments,
      })

      if (!result.ok) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      }

      return {
        content: [{
          type: 'text',
          text: `${result.count} review comment${result.count !== 1 ? 's' : ''} added to the Code Review view.`,
        }],
      }
    } catch {
      return bridgeError('batch_review_comments')
    }
  }

  if (name === 'add_kanban_tasks') {
    const { tasks } = args as { tasks: KanbanTask[] }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: tasks must be a non-empty array' }],
        isError: true,
      }
    }

    try {
      const result = await bridgePost('/kanban/add-tasks', { tasks })

      if (!result.ok) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true }
      }

      const count = result.count ?? tasks.length
      return {
        content: [{
          type: 'text',
          text: `${count} kanban task${count !== 1 ? 's' : ''} queued on the current canvas. ` +
                `Duplicate titles already on the board will be skipped automatically.`,
        }],
      }
    } catch {
      return bridgeError('add_kanban_tasks')
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport()
await server.connect(transport)
