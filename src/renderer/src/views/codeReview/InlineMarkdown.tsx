import React, { useEffect, useRef } from 'react'
import { getHighlighter, SHIKI_THEME } from './shikiHighlighter'

/**
 * Renders a subset of inline markdown:
 *   `code`     → highlighted <code>
 *   **bold**   → <strong>
 *   *italic*   → <em>
 *   @mention   → colored chip (matches the autocomplete slug format)
 *
 * Code spans are syntax-highlighted with shiki when they look like real code.
 */
export function InlineMarkdown({ text }: { text: string }): React.ReactElement {
  const tokens = tokenize(text)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'text') return <React.Fragment key={i}>{tok.value}</React.Fragment>
        if (tok.type === 'bold') return <strong key={i}>{tok.value}</strong>
        if (tok.type === 'italic') return <em key={i}>{tok.value}</em>
        if (tok.type === 'mention') return <MentionChip key={i} slug={tok.value} />
        return <CodeSpan key={i} text={tok.value} />
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'mention'; value: string } // value = the slug (no @)

// Mentions only match if at start-of-string or after whitespace, to avoid
// chewing up emails like foo@bar. The lookbehind keeps the regex stateless.
const TOKEN_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|(?:^|(?<=\s))@[a-z][a-z0-9-]*)/gi

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('`')) tokens.push({ type: 'code', value: tok.slice(1, -1) })
    else if (tok.startsWith('**')) tokens.push({ type: 'bold', value: tok.slice(2, -2) })
    else if (tok.startsWith('*')) tokens.push({ type: 'italic', value: tok.slice(1, -1) })
    else tokens.push({ type: 'mention', value: tok.slice(1) }) // strip leading @
    last = m.index + tok.length
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

// ---------------------------------------------------------------------------
// Mention chip
// ---------------------------------------------------------------------------

const MENTION_COLOR: Record<string, string> = {
  main: '#22c55e',
  reviewer: '#14b8a6',
}

function MentionChip({ slug }: { slug: string }): React.ReactElement {
  // Slug is what came after @ in the message body. Color by known role.
  const lower = slug.toLowerCase()
  const color = MENTION_COLOR[lower] ?? '#a78bfa'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0 6px',
        margin: '0 1px',
        borderRadius: 4,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
        fontSize: '0.88em',
        fontWeight: 600,
      }}
    >
      @{slug}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Code span with async syntax highlighting
// ---------------------------------------------------------------------------

function looksLikeCode(s: string): boolean {
  if (s.length < 4) return false
  if (/^[\w./-]+$/.test(s)) return false
  return /[()[\]{}<>=]/.test(s)
}

function CodeSpan({ text }: { text: string }): React.ReactElement {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!looksLikeCode(text)) return
    let cancelled = false
    ;(async () => {
      try {
        const hl = await getHighlighter()
        if (cancelled || !ref.current) return
        const html = hl.codeToHtml(text, { lang: 'typescript', theme: SHIKI_THEME })
        const tmp = document.createElement('div')
        tmp.innerHTML = html
        const codeEl = tmp.querySelector('code')
        if (codeEl && ref.current) {
          ref.current.textContent = ''
          while (codeEl.firstChild) ref.current.appendChild(codeEl.firstChild)
        }
      } catch { /* fall back to plain text */ }
    })()
    return () => { cancelled = true }
  }, [text])

  return (
    <code
      ref={ref}
      style={{
        background: 'rgba(110,118,129,0.4)',
        padding: '0.15em 0.4em',
        margin: '0 1px',
        borderRadius: 4,
        fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
        fontSize: '0.9em',
        color: 'rgba(255,255,255,0.92)',
      }}
    >
      {text}
    </code>
  )
}
