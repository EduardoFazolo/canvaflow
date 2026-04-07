import React, { useEffect, useRef } from 'react'
import { getHighlighter, SHIKI_THEME } from './shikiHighlighter'

/**
 * Renders a subset of inline markdown:
 *   `code`  → highlighted <code>
 *   **bold** → <strong>
 *   *italic* → <em>
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

const TOKEN_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('`')) tokens.push({ type: 'code', value: tok.slice(1, -1) })
    else if (tok.startsWith('**')) tokens.push({ type: 'bold', value: tok.slice(2, -2) })
    else tokens.push({ type: 'italic', value: tok.slice(1, -1) })
    last = m.index + tok.length
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
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
