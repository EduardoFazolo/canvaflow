import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BRIDGE_URL = 'http://127.0.0.1:47823'

const server = new Server(
  { name: 'lovable', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'send_to_lovable',
      description:
        'Send a prompt to the Lovable instance running inside CanvaFlow. ' +
        'The prompt is injected directly into Lovable\'s chat input and submitted — ' +
        'the user will see it appear and Lovable will start generating. ' +
        'CanvaFlow must be open with at least one Lovable node on the canvas.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to send to Lovable',
          },
          node_id: {
            type: 'string',
            description:
              'Optional: target a specific Lovable node by its canvas node ID. ' +
              'If omitted, the most recently active logged-in node is used.',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'get_lovable_status',
      description:
        'Check the status of open Lovable nodes in CanvaFlow — ' +
        'whether they are logged in and what URL they are currently showing.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}))

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'send_to_lovable') {
    const { prompt, node_id } = args as { prompt: string; node_id?: string }

    if (!prompt?.trim()) {
      return {
        content: [{ type: 'text', text: 'Error: prompt cannot be empty' }],
        isError: true,
      }
    }

    try {
      const body: Record<string, string> = { prompt }
      if (node_id) body.nodeId = node_id

      const response = await fetch(`${BRIDGE_URL}/send-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = (await response.json()) as { ok: boolean; targetNodeId?: string; error?: string }

      if (!data.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${data.error}` }],
          isError: true,
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Prompt sent to Lovable${data.targetNodeId ? ` (node: ${data.targetNodeId})` : ''}.\n\nLovable is now processing: "${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"`,
          },
        ],
      }
    } catch {
      return {
        content: [
          {
            type: 'text',
            text:
              'Could not reach CanvaFlow. Make sure:\n' +
              '1. CanvaFlow is running\n' +
              '2. You have a Lovable node open on the canvas\n' +
              `3. The MCP bridge is listening on port 7823`,
          },
        ],
        isError: true,
      }
    }
  }

  if (name === 'get_lovable_status') {
    try {
      const response = await fetch(`${BRIDGE_URL}/status`)
      const data = (await response.json()) as {
        ok: boolean
        nodes: Array<{ nodeId: string; loggedIn: boolean; url: string; lastSeen: number }>
      }

      if (!data.nodes.length) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Lovable nodes are currently open in CanvaFlow.\n\nOpen CanvaFlow and add a Lovable node to the canvas (⌘⇧L).',
            },
          ],
        }
      }

      const lines = data.nodes.map((n) => {
        const ago = Math.round((Date.now() - n.lastSeen) / 1000)
        const status = n.loggedIn ? '✓ logged in' : '✗ not logged in'
        return `• Node ${n.nodeId.slice(0, 8)}…  ${status}  ${n.url}  (seen ${ago}s ago)`
      })

      return {
        content: [
          {
            type: 'text',
            text: `Lovable nodes in CanvaFlow:\n\n${lines.join('\n')}`,
          },
        ],
      }
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'Could not reach CanvaFlow. Make sure the app is running.',
          },
        ],
        isError: true,
      }
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
