import React from 'react'
import type { ReviewComment } from '../../../../modules/servers/canvaflow_mcp/shared/types'
import { InlineMarkdown } from './InlineMarkdown'

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  nit: '#9ca3af',
}

export function CommentCard({ comment }: { comment: ReviewComment }): React.ReactElement {
  const color = SEVERITY_COLOR[comment.severity] ?? '#6b7280'

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a78bfa, #6366f1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: 12, fontWeight: 700, color: '#fff',
        }}>✦</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>
          Claude
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          commented on line {comment.line}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}1a`, border: `1px solid ${color}40`,
          padding: '2px 8px', borderRadius: 12,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {comment.severity.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div
        className="code-review-selectable"
        style={{
          padding: '12px 14px',
          fontSize: 13,
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          cursor: 'text',
        }}>
        <InlineMarkdown text={comment.message} />
      </div>
    </div>
  )
}
