import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeData } from '../../stores/nodeStore'
import { agentLabel, agentSlug } from '../../../../plugins/kanban/renderer/agentShared'

const ROLE_COLOR: Record<string, string> = {
  main: '#22c55e',
  reviewer: '#14b8a6',
}

function dotColor(node: NodeData): string {
  return ROLE_COLOR[node.agentRole ?? ''] ?? 'rgba(255,255,255,0.4)'
}

/** Match a partial `@token` immediately before the cursor (no whitespace inside). */
const PARTIAL_MENTION_RE = /@([a-z0-9-]*)$/i

/**
 * Textarea with `@mention` autocomplete. Trigger by typing `@`, navigate with
 * arrows, insert with Enter or Tab, dismiss with Escape. Cmd/Ctrl+Enter
 * submits the whole textarea via `onSubmit`.
 */
export function MentionAwareTextarea({
  value,
  onChange,
  onSubmit,
  agents,
  placeholder,
  rows = 2,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  agents: NodeData[]
  placeholder?: string
  rows?: number
}): React.ReactElement {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return agents
    return agents.filter((a) => agentSlug(a).toLowerCase().startsWith(q))
  }, [agents, query])

  // Reset selection if filter changes such that the index is out of bounds
  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0)
  }, [filtered.length, selectedIdx])

  // Scan the text just before the cursor for an active `@partial` token.
  // If found, open the autocomplete popover, otherwise close it.
  const refreshMentionState = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, cursor)
    // The `@` must be at the very start of the string OR preceded by whitespace
    // — otherwise emails (foo@bar) would trigger the popover.
    const match = PARTIAL_MENTION_RE.exec(before)
    if (!match) {
      setOpen(false)
      return
    }
    const startsAt = before.length - match[0].length
    const charBefore = startsAt === 0 ? ' ' : before[startsAt - 1]
    if (!/\s/.test(charBefore)) {
      setOpen(false)
      return
    }
    setQuery(match[1] ?? '')
    setOpen(true)
    setSelectedIdx(0)

    // Position popover below the textarea (simple, predictable). For more
    // precise caret-anchored positioning we'd need a hidden mirror div.
    const r = ta.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
  }, [value])

  useEffect(() => {
    refreshMentionState()
  }, [refreshMentionState])

  const insertMention = useCallback((agent: NodeData) => {
    const ta = taRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const replaced = before.replace(PARTIAL_MENTION_RE, `@${agentSlug(agent)} `)
    const next = replaced + after
    onChange(next)
    setOpen(false)
    // Restore cursor position to right after the inserted mention + space
    const newCursor = replaced.length
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(newCursor, newCursor)
    })
  }, [value, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation() // don't let the canvas hijack typing

    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filtered[selectedIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
    }

    // Cmd/Ctrl+Enter submits regardless of popover state
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }, [open, filtered, selectedIdx, insertMention, onSubmit])

  return (
    <>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={refreshMentionState}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%',
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 6,
          color: 'rgba(255,255,255,0.88)',
          fontSize: 12.5,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '8px 10px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          lineHeight: 1.5,
        }}
      />

      {open && pos && filtered.length > 0 && createPortal(
        <div
          ref={popRef}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1000000,
            width: 240,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4)',
            padding: 4,
          }}
        >
          {filtered.map((agent, i) => {
            const isActive = i === selectedIdx
            return (
              <div
                key={agent.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(agent) }}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dotColor(agent), flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.88)',
                  fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
                }}>
                  @{agentSlug(agent)}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.4)',
                  marginLeft: 'auto',
                }}>
                  {agentLabel(agent)}
                </span>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
