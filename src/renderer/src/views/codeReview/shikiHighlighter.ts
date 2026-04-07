import { createHighlighter, type Highlighter } from 'shiki'

const SHIKI_LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'python', 'rust', 'go',
  'json', 'yaml', 'toml', 'shell', 'bash', 'sql', 'html', 'css',
  'markdown', 'java', 'c', 'cpp', 'csharp', 'ruby', 'php',
] as const

export const SHIKI_THEME = 'dark-plus'

let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: SHIKI_LANGS as unknown as string[],
    })
  }
  return highlighterPromise
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx',
  js: 'javascript', jsx: 'jsx',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', markdown: 'markdown',
  html: 'html', css: 'css', scss: 'css', less: 'css',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', java: 'java',
  cs: 'csharp', php: 'php',
}

export function langForFile(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? null
}

/**
 * Highlight a single line of code into an HTML string. Returns null if the
 * highlighter isn't ready or the language isn't supported — caller should
 * fall back to plain text.
 */
export async function highlightLine(line: string, lang: string): Promise<string | null> {
  if (!lang) return null
  try {
    const hl = await getHighlighter()
    // codeToHtml wraps in <pre><code><span class="line">...</span></code></pre>
    // We extract just the inner spans for inline insertion
    const html = hl.codeToHtml(line || ' ', { lang, theme: SHIKI_THEME })
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    const lineSpan = tmp.querySelector('code span.line')
    return lineSpan?.innerHTML ?? null
  } catch {
    return null
  }
}
