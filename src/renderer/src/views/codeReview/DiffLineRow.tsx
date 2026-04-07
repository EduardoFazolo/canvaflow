import React, { useEffect, useState } from 'react'
import type { DiffLine } from './types'
import { highlightLine } from './shikiHighlighter'

const KIND_BG: Record<string, string> = {
  add: 'rgba(46, 160, 67, 0.15)',
  del: 'rgba(248, 81, 73, 0.15)',
  ctx: 'transparent',
}

const KIND_GUTTER_BG: Record<string, string> = {
  add: 'rgba(46, 160, 67, 0.3)',
  del: 'rgba(248, 81, 73, 0.3)',
  ctx: 'transparent',
}

const KIND_SIGN: Record<string, string> = {
  add: '+',
  del: '-',
  ctx: ' ',
}

const KIND_SIGN_COLOR: Record<string, string> = {
  add: '#3fb950',
  del: '#f85149',
  ctx: 'rgba(255,255,255,0.3)',
}

export function DiffLineRow({
  line,
  language,
}: {
  line: DiffLine
  language: string | null
}): React.ReactElement {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!language) return
    let cancelled = false
    highlightLine(line.content, language).then((html) => {
      if (!cancelled) setHighlightedHtml(html)
    })
    return () => { cancelled = true }
  }, [line.content, language])

  return (
    <div style={{
      display: 'flex',
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 1.55,
      background: KIND_BG[line.kind],
    }}>
      {/* Old line number gutter */}
      <div style={{
        width: 50,
        flexShrink: 0,
        textAlign: 'right',
        padding: '0 8px',
        color: 'rgba(255,255,255,0.3)',
        userSelect: 'none',
        background: KIND_GUTTER_BG[line.kind],
      }}>
        {line.oldLine ?? ''}
      </div>
      {/* New line number gutter */}
      <div style={{
        width: 50,
        flexShrink: 0,
        textAlign: 'right',
        padding: '0 8px',
        color: 'rgba(255,255,255,0.3)',
        userSelect: 'none',
        background: KIND_GUTTER_BG[line.kind],
      }}>
        {line.newLine ?? ''}
      </div>
      {/* Sign */}
      <div style={{
        width: 16,
        flexShrink: 0,
        textAlign: 'center',
        color: KIND_SIGN_COLOR[line.kind],
        userSelect: 'none',
      }}>
        {KIND_SIGN[line.kind]}
      </div>
      {/* Code content */}
      <div
        className="code-review-selectable"
        style={{
          flex: 1,
          minWidth: 0,
          paddingRight: 16,
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          cursor: 'text',
        }}
        // Shiki output is trusted: it's our local highlighter producing
        // sanitized <span> markup, no user-provided HTML.
        {...(highlightedHtml
          ? { dangerouslySetInnerHTML: { __html: highlightedHtml } }
          : { children: line.content || ' ' })}
      />
    </div>
  )
}
