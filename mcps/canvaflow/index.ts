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

  if (name === 'batch_review_comments') {
    const { review_id, comments } = args as {
      review_id: string; comments: ReviewComment[]
    }

    try {
      const result = await bridgePost('/review/comments', {
        reviewId: review_id,
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
