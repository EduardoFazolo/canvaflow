import React, { useState, useCallback, useRef } from 'react'
import type { ReviewThread, ReviewMessage } from '../../../../modules/servers/canvaflow_mcp/shared/types'
import type { NodeData } from '../../stores/nodeStore'
import { useReviewStore } from '../../stores/reviewStore'
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

function MessageRow({ message, isFirst }: { message: ReviewMessage; isFirst: boolean }): React.ReactElement {
  const severityColor = message.severity ? SEVERITY_COLOR[message.severity] : null
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
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: ROLE_AVATAR_GRADIENT[message.authorRole] ?? ROLE_AVATAR_GRADIENT.agent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: 12, fontWeight: 700, color: '#fff',
        }}>
          {ROLE_AVATAR_GLYPH[message.authorRole] ?? '?'}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>
          {message.authorName}
        </span>
        <div style={{ flex: 1 }} />
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
