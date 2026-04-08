import React, { useState, useCallback, useRef } from 'react'
import type { ReviewThread, ReviewMessage } from '../../../../modules/servers/canvaflow_mcp/shared/types'
import type { NodeData } from '../../stores/nodeStore'
import { useNodeStore } from '../../stores/nodeStore'
import { useReviewStore } from '../../stores/reviewStore'
import { switchCanvas } from '../../stores/canvasManager'
import { zoomFitNode } from '../../utils/zoomFocus'
import {
  MENTION_REGEX,
  resolveAgentFromSlug,
} from '../../../../plugins/kanban/renderer/agentShared'
import { InlineMarkdown } from './InlineMarkdown'
import { MentionAwareTextarea } from './MentionAwareTextarea'
import { buildSingleThreadPrompt, dispatchToAgent } from './sendToAgent'

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  nit: '#9ca3af',
}

const ROLE_AVATAR_GRADIENT: Record<string, string> = {
  reviewer: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  main: 'linear-gradient(135deg, #22c55e, #16a34a)',
  agent: 'linear-gradient(135deg, #a78bfa, #6366f1)',
  user: 'linear-gradient(135deg, #60a5fa, #2563eb)',
}

const ROLE_AVATAR_GLYPH: Record<string, string> = {
  reviewer: '✦',
  main: '✦',
  agent: '✦',
  user: '👤',
}

/**
 * Switch to the canvas containing the given agent node and zoom the camera
 * onto it. Returns true if the node was found and the jump happened.
 */
function jumpToAgent(nodeId: string): boolean {
  const store = useNodeStore.getState()
  for (const [canvasId, canvasNodes] of store.workspaceNodes.entries()) {
    if (canvasNodes.has(nodeId)) {
      switchCanvas(canvasId)
      // Defer zoom one frame so the canvas has rendered its new dimensions.
      // zoomFitNode reads the canvas rect and the active store's nodes, both
      // of which need the just-switched state to be committed.
      requestAnimationFrame(() => zoomFitNode(nodeId))
      return true
    }
  }
  return false
}

/**
 * Every agent-authored message carries the `authorNodeId` of the claude node
 * that produced it (stamped server-side by the MCP server from its
 * `CANVAFLOW_NODE_ID` env var). That id is the single source of truth for
 * "which agent on which canvas?" — no name or role matching needed.
 */
function resolveJumpTarget(message: ReviewMessage): string | null {
  return message.authorNodeId ?? null
}

function MessageRow({
  message,
  isFirst,
}: {
  message: ReviewMessage
  isFirst: boolean
}): React.ReactElement {
  const severityColor = message.severity ? SEVERITY_COLOR[message.severity] : null
  const jumpTargetId = message.authorRole === 'user' ? null : resolveJumpTarget(message)
  const canJump = !!jumpTargetId

  const handleJump = (e: React.MouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    if (jumpTargetId) jumpToAgent(jumpTargetId)
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderTop: isFirst ? 'none' : '1px solid #21262d',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
      }}>
        {/* Avatar — clickable when this message has a node to jump to */}
        <div
          onClick={handleJump}
          title={canJump ? 'Jump to this agent on the canvas' : undefined}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: ROLE_AVATAR_GRADIENT[message.authorRole] ?? ROLE_AVATAR_GRADIENT.agent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 12, fontWeight: 700, color: '#fff',
            cursor: canJump ? 'pointer' : 'default',
          }}
        >
          {ROLE_AVATAR_GLYPH[message.authorRole] ?? '?'}
        </div>
        {/* Name — also clickable */}
        <span
          onClick={handleJump}
          title={canJump ? 'Jump to this agent on the canvas' : undefined}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.88)',
            cursor: canJump ? 'pointer' : 'default',
          }}
        >
          {message.authorName}
        </span>
        <div style={{ flex: 1 }} />
        {/* Compact arrow button — only when jumpable */}
        {canJump && (
          <button
            type="button"
            onClick={handleJump}
            title="Jump to this agent on the canvas"
            style={{
              width: 22, height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'rgba(167,139,250,0.6)',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(167,139,250,0.12)',
                color: 'rgba(167,139,250,1)',
              })
            }}
            onMouseLeave={(e) => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'transparent',
                color: 'rgba(167,139,250,0.6)',
              })
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 9L9 3M9 3H4.5M9 3v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        {severityColor && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: severityColor,
            background: `${severityColor}1a`, border: `1px solid ${severityColor}40`,
            padding: '2px 8px', borderRadius: 12,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            {message.severity!.toUpperCase()}
          </span>
        )}
      </div>

      {/* Body */}
      <div
        className="code-review-selectable"
        style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          cursor: 'text',
        }}>
        <InlineMarkdown text={message.body} />
      </div>
    </div>
  )
}

/**
 * Extract any `@mention` tokens from a message body and resolve them to agents
 * on the canvas. Duplicates are dropped — each agent is mentioned at most once.
 */
function extractMentionedAgents(text: string, agents: NodeData[]): NodeData[] {
  const seen = new Set<string>()
  const out: NodeData[] = []
  for (const m of text.matchAll(MENTION_REGEX)) {
    const slug = m[1]
    const agent = resolveAgentFromSlug(slug, agents)
    if (agent && !seen.has(agent.id)) {
      seen.add(agent.id)
      out.push(agent)
    }
  }
  return out
}

export function ThreadCard({
  thread,
  branchName,
  agents,
}: {
  thread: ReviewThread
  reviewId: string
  branchName: string
  agents: NodeData[]
}): React.ReactElement {
  const appendMessage = useReviewStore((s) => s.appendMessage)
  const [reply, setReply] = useState('')
  // Guard against double-fire: handlePost can be triggered by both Cmd+Enter
  // (textarea keydown) and the Post button click in rapid succession before
  // setReply('') propagates through React's render cycle.
  const postingRef = useRef(false)

  const handlePost = useCallback(() => {
    if (postingRef.current) return
    const trimmed = reply.trim()
    if (!trimmed) return
    postingRef.current = true
    // Release the lock after the next render flush
    setTimeout(() => { postingRef.current = false }, 0)

    // 1. Append the user's message to the thread locally (always)
    const userMsg: ReviewMessage = {
      authorNodeId: null,
      authorName: 'You',
      authorRole: 'user',
      body: trimmed,
      createdAt: Date.now(),
    }
    appendMessage(thread.id, userMsg)
    setReply('')

    // 2. If the message has @mentions, dispatch to each mentioned agent.
    //    The mentions are part of the body so they appear in the thread for
    //    everyone to see — that's the same body the agent will read.
    const mentioned = extractMentionedAgents(trimmed, agents)
    if (mentioned.length === 0) return

    const updatedThread: ReviewThread = {
      ...thread,
      messages: [...thread.messages, userMsg],
    }
    const prompt = buildSingleThreadPrompt({ branchName, thread: updatedThread })
    for (const agent of mentioned) {
      dispatchToAgent(agent.id, prompt)
    }
  }, [reply, thread, branchName, agents, appendMessage])

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Stacked messages */}
      {thread.messages.map((m, i) => (
        <MessageRow key={i} message={m} isFirst={i === 0} />
      ))}

      {/* Reply footer */}
      <div style={{
        borderTop: '1px solid #21262d',
        background: '#0a0d13',
        padding: '10px 14px',
      }}>
        <MentionAwareTextarea
          value={reply}
          onChange={setReply}
          onSubmit={handlePost}
          agents={agents}
          placeholder="Write a reply… type @ to mention an agent"
        />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
        }}>
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.3)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            Type <code style={{
              background: 'rgba(167,139,250,0.15)',
              color: 'rgba(167,139,250,0.85)',
              padding: '0 4px',
              borderRadius: 3,
              fontFamily: 'ui-monospace, monospace',
            }}>@main</code> to route to an agent · ⌘↵ to post
          </span>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            disabled={!reply.trim()}
            onClick={handlePost}
            style={{
              padding: '4px 14px',
              borderRadius: 6,
              border: '1px solid rgba(167,139,250,0.4)',
              background: reply.trim() ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.05)',
              color: reply.trim() ? 'rgba(167,139,250,0.95)' : 'rgba(167,139,250,0.35)',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
              cursor: reply.trim() ? 'pointer' : 'default',
            }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  )
}
