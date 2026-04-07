import React, { useState, useCallback, useEffect, useRef } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useViewStore } from '../stores/viewStore'
import { useReviewStore } from '../stores/reviewStore'
import { useNodeStore } from '../stores/nodeStore'
import { spawnAgent } from '../../../plugins/kanban/renderer/agentShared'
import { switchCanvas } from '../stores/canvasManager'
import type { ReviewComment } from '../../../modules/servers/canvaflow_mcp/shared/types'

// Monaco setup is already imported globally via the monaco plugin's setup.ts
// We just need the theme name and options to match
import '../../../plugins/monaco/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEME_NAME = 'canvaflow-dark'

const DIFF_OPTIONS: Monaco.editor.IDiffEditorConstructionOptions = {
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
  fontLigatures: true,
  fontSize: 13,
  lineHeight: 1.6,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  readOnly: true,
  renderSideBySide: true,
  padding: { top: 8, bottom: 12 },
  renderLineHighlight: 'none',
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', markdown: 'markdown',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', java: 'java', kt: 'kotlin', swift: 'swift',
  tf: 'hcl', lua: 'lua', cs: 'csharp', php: 'php',
}

function getLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

const STATUS_LABEL: Record<string, string> = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
}

const STATUS_COLOR: Record<string, string> = {
  A: '#73c991',
  M: '#e2c08d',
  D: '#f44747',
  R: '#73c991',
  C: '#73c991',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  nit: '#6b7280',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'rgba(239,68,68,0.08)',
  warning: 'rgba(245,158,11,0.08)',
  nit: 'rgba(107,114,128,0.06)',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'rgba(239,68,68,0.2)',
  warning: 'rgba(245,158,11,0.2)',
  nit: 'rgba(107,114,128,0.15)',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffFile {
  path: string
  status: string
  additions: number
  deletions: number
}

const EMPTY_COMMENTS: ReviewComment[] = []

// ---------------------------------------------------------------------------
// Inline diff viewer with review comment view zones
// ---------------------------------------------------------------------------

function InlineDiffWithComments({
  file,
  language,
  original,
  modified,
  comments,
}: {
  file: string
  language: string
  original: string
  modified: string
  comments: ReviewComment[]
}): React.ReactElement {
  const [diffEditor, setDiffEditor] = useState<Monaco.editor.IStandaloneDiffEditor | null>(null)
  const zoneIdsRef = useRef<string[]>([])

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneDiffEditor) => {
    setDiffEditor(editor)
  }, [])

  // Build a comment card DOM node — styled like a GitHub PR review comment
  const buildCommentCard = useCallback((lineComments: ReviewComment[], width: number): HTMLElement => {
    const container = document.createElement('div')
    container.style.cssText = [
      `width: ${width}px`,
      'box-sizing: border-box',
      'padding: 8px 16px 12px 60px',
      'background: #0d0d0d',
      'overflow: hidden',
    ].join(';')

    const card = document.createElement('div')
    card.style.cssText = [
      'background: #161b22',
      'border: 1px solid #30363d',
      'border-radius: 8px',
      'overflow: hidden',
      'box-shadow: 0 1px 0 rgba(0,0,0,0.4)',
    ].join(';')

    for (let i = 0; i < lineComments.length; i++) {
      const c = lineComments[i]
      const color = SEVERITY_COLOR[c.severity] ?? '#6b7280'

      const item = document.createElement('div')
      item.style.cssText = i > 0
        ? 'border-top: 1px solid #30363d; padding: 12px 16px;'
        : 'padding: 12px 16px;'

      // Header: avatar dot + name + severity badge
      const header = document.createElement('div')
      header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;'

      const avatar = document.createElement('div')
      avatar.style.cssText = [
        'width: 20px', 'height: 20px', 'border-radius: 50%',
        'background: linear-gradient(135deg, #a78bfa, #6366f1)',
        'display: flex', 'align-items: center', 'justify-content: center',
        'flex-shrink: 0',
        'font-size: 11px', 'font-weight: 700', 'color: #fff',
        'font-family: system-ui, sans-serif',
      ].join(';')
      avatar.textContent = '✦'

      const name = document.createElement('span')
      name.textContent = 'Claude'
      name.style.cssText = [
        'font-size: 13px', 'font-weight: 600',
        'color: rgba(255,255,255,0.85)',
        'font-family: system-ui, -apple-system, sans-serif',
      ].join(';')

      const sep = document.createElement('span')
      sep.textContent = '·'
      sep.style.cssText = 'color: rgba(255,255,255,0.3); font-size: 12px;'

      const lineLabel = document.createElement('span')
      lineLabel.textContent = `line ${c.line}`
      lineLabel.style.cssText = [
        'font-size: 11px', 'color: rgba(255,255,255,0.4)',
        'font-family: monospace',
      ].join(';')

      const spacer = document.createElement('div')
      spacer.style.cssText = 'flex: 1;'

      const badge = document.createElement('span')
      badge.textContent = c.severity.toUpperCase()
      badge.style.cssText = [
        'font-size: 10px', 'font-weight: 700', `color: ${color}`,
        `background: ${color}1a`, `border: 1px solid ${color}40`,
        'padding: 2px 7px', 'border-radius: 10px',
        'letter-spacing: 0.04em', 'font-family: system-ui, sans-serif',
        'flex-shrink: 0',
      ].join(';')

      header.appendChild(avatar)
      header.appendChild(name)
      header.appendChild(sep)
      header.appendChild(lineLabel)
      header.appendChild(spacer)
      header.appendChild(badge)

      // Body
      const body = document.createElement('div')
      body.textContent = c.message
      body.style.cssText = [
        'font-size: 13px',
        'color: rgba(255,255,255,0.82)',
        'line-height: 1.55',
        'white-space: pre-wrap',
        'overflow-wrap: anywhere',
        'word-break: break-word',
        'font-family: system-ui, -apple-system, sans-serif',
      ].join(';')

      item.appendChild(header)
      item.appendChild(body)
      card.appendChild(item)
    }

    container.appendChild(card)
    return container
  }, [])

  // Measure card height for view zone allocation
  const measureHeight = useCallback((node: HTMLElement): number => {
    node.style.position = 'absolute'
    node.style.visibility = 'hidden'
    node.style.top = '-9999px'
    node.style.left = '0'
    document.body.appendChild(node)
    const h = node.offsetHeight
    document.body.removeChild(node)
    node.style.position = ''
    node.style.visibility = ''
    node.style.top = ''
    node.style.left = ''
    return h
  }, [])

  // Inject view zones whenever comments or the editor change
  useEffect(() => {
    if (!diffEditor) return

    const modifiedEditor = diffEditor.getModifiedEditor()

    const renderZones = () => {
      // Remove previous zones
      if (zoneIdsRef.current.length > 0) {
        modifiedEditor.changeViewZones((accessor) => {
          for (const id of zoneIdsRef.current) accessor.removeZone(id)
        })
        zoneIdsRef.current = []
      }

      if (comments.length === 0) return

      // Group comments by line
      const byLine = new Map<number, ReviewComment[]>()
      for (const c of comments) {
        const list = byLine.get(c.line) ?? []
        list.push(c)
        byLine.set(c.line, list)
      }

      const sortedLines = [...byLine.keys()].sort((a, b) => a - b)
      const width = modifiedEditor.getLayoutInfo().width
      const newZoneIds: string[] = []

      modifiedEditor.changeViewZones((accessor) => {
        for (const line of sortedLines) {
          const lineComments = byLine.get(line)!
          const card = buildCommentCard(lineComments, width)
          const height = measureHeight(card) + 8

          const id = accessor.addZone({
            afterLineNumber: line,
            heightInPx: height,
            domNode: card,
            suppressMouseDown: true,
          })
          newZoneIds.push(id)
        }
      })

      zoneIdsRef.current = newZoneIds
    }

    renderZones()

    // Re-render zones when the editor is resized so widths/heights stay correct
    const disposable = modifiedEditor.onDidLayoutChange(() => {
      renderZones()
    })

    return () => disposable.dispose()
  }, [comments, diffEditor, buildCommentCard, measureHeight])

  return (
    <DiffEditor
      height="100%"
      language={language}
      original={original}
      modified={modified}
      theme={THEME_NAME}
      options={DIFF_OPTIONS}
      onMount={handleMount}
    />
  )
}

// ---------------------------------------------------------------------------
// CodeReviewView
// ---------------------------------------------------------------------------

export function CodeReviewView(): React.ReactElement {
  const activeView = useViewStore((s) => {
    const inst = s.instances.find((i) => i.id === s.activeId)
    return inst?.type === 'code-review' ? inst : null
  })

  const worktreePath = activeView?.worktreePath ?? ''
  const branchName = activeView?.branchName ?? ''
  const reviewId = activeView?.id ?? ''

  // Review comments from the store (populated by MCP bridge)
  const allComments = useReviewStore((s) => reviewId ? (s.comments[reviewId] ?? EMPTY_COMMENTS) : EMPTY_COMMENTS)
  const [reviewRunning, setReviewRunning] = useState(false)

  const startAiReview = useCallback(async () => {
    if (!worktreePath || !branchName || !reviewId) return
    setReviewRunning(true)

    // Inject MCP config so the agent can use canvaflow tools
    await window.canvaflowMcp.injectConfig(worktreePath)

    // Find the worktree's canvas view to spawn the agent on
    const viewStore = useViewStore.getState()
    const canvasView = viewStore.instances.find((i) =>
      i.type === 'canvas' && i.worktreePath === worktreePath
    )
    if (!canvasView) {
      setReviewRunning(false)
      return
    }

    const prompt = [
      `You are a code reviewer. Review the code changes on branch "${branchName}" compared to main.`,
      '',
      'IMPORTANT CONSTRAINTS:',
      '- You must ONLY review code — do NOT modify, fix, or change any files.',
      '- Focus EXCLUSIVELY on the diff between this branch and main.',
      '',
      'Steps:',
      '1. Run: git diff main...HEAD',
      '2. If the diff is large, run: git diff main...HEAD --stat',
      '3. Analyze every change carefully.',
      '',
      'Review for: bugs, code smells, sloppiness, security issues, performance problems, readability.',
      '',
      'For each issue found, use the `batch_review_comments` MCP tool to report your findings.',
      `Use review_id: "${reviewId}"`,
      '',
      'Each comment needs: file (relative path), line (1-based line number in the modified file), severity (critical/warning/nit), message.',
      '',
      'After analyzing all changes, call batch_review_comments ONCE with ALL your findings.',
      'If the code is clean, say so — do not invent issues.',
    ].join('\n')

    spawnAgent({
      agentId: 'claude',
      viewKey: canvasView.id,
      worktreePath,
      taskLabel: `Code review: ${branchName}`,
      prompt,
      skipCommit: true,
    })

    // Switch to the canvas so the user can watch the agent work
    switchCanvas(canvasView.id)
  }, [worktreePath, branchName, reviewId])

  const [files, setFiles] = useState<DiffFile[]>([])
  const [mergeBase, setMergeBase] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [originalContent, setOriginalContent] = useState<string>('')
  const [modifiedContent, setModifiedContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [fileLoading, setFileLoading] = useState(false)
  const [error, setError] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const resizing = useRef(false)

  const [headRef, setHeadRef] = useState('')

  // Load file list
  useEffect(() => {
    if (!worktreePath || !branchName) return
    setLoading(true)
    setError('')
    setFiles([])
    setSelectedFile(null)

    window.git.diffBranchFiles(worktreePath, branchName, 'main').then((result) => {
      setFiles(result.files)
      setMergeBase(result.mergeBase)
      setHeadRef(result.branch)
      setLoading(false)
      // Auto-select first file
      if (result.files.length > 0) {
        setSelectedFile(result.files[0].path)
      }
    }).catch((e) => {
      setError(e?.message ?? String(e))
      setLoading(false)
    })
  }, [worktreePath, branchName])

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedFile || !worktreePath || !mergeBase || !headRef) return
    const file = files.find((f) => f.path === selectedFile)
    if (!file) return

    setFileLoading(true)

    const loadContent = async () => {
      try {
        if (file.status === 'D') {
          // Deleted: original has content, modified is empty
          const orig = await window.git.fileAtRef(worktreePath, mergeBase, file.path)
          setOriginalContent(orig ?? '')
          setModifiedContent('')
        } else if (file.status === 'A') {
          // Added: original is empty, modified has content
          setOriginalContent('')
          const mod = await window.git.fileAtRef(worktreePath, headRef, file.path)
          setModifiedContent(mod ?? '')
        } else {
          // Modified: both sides
          const [orig, mod] = await Promise.all([
            window.git.fileAtRef(worktreePath, mergeBase, file.path),
            window.git.fileAtRef(worktreePath, headRef, file.path),
          ])
          setOriginalContent(orig ?? '')
          setModifiedContent(mod ?? '')
        }
      } catch {
        setOriginalContent('')
        setModifiedContent('')
      }
      setFileLoading(false)
    }

    loadContent()
  }, [selectedFile, worktreePath, mergeBase, headRef, files])

  // Sidebar resize
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    resizing.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return
      setSidebarWidth(Math.max(180, Math.min(500, startWidth + ev.clientX - startX)))
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [sidebarWidth])

  // Totals
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  if (!activeView) {
    return <div style={{ flex: 1, background: '#0d0d0d' }} />
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0d0d0d', height: '100%' }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="rgba(167,139,250,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <line x1="10" y1="10" x2="14.5" y2="14.5" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
            Code Review
          </span>
        </div>
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(34,211,238,0.7)' }}>
          {branchName}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>→ main</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </span>
        {totalAdditions > 0 && (
          <span style={{ fontSize: 11, color: '#73c991', fontFamily: 'monospace' }}>+{totalAdditions}</span>
        )}
        {totalDeletions > 0 && (
          <span style={{ fontSize: 11, color: '#f44747', fontFamily: 'monospace' }}>-{totalDeletions}</span>
        )}
        {allComments.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#a78bfa',
            background: 'rgba(167,139,250,0.12)', borderRadius: 8,
            padding: '1px 8px', lineHeight: '18px',
          }}>
            {allComments.length} comment{allComments.length !== 1 ? 's' : ''}
          </span>
        )}
        {files.length > 0 && (
          <button
            onClick={startAiReview}
            disabled={reviewRunning}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: '1px solid rgba(167,139,250,0.3)',
              background: reviewRunning ? 'rgba(167,139,250,0.05)' : 'rgba(167,139,250,0.1)',
              color: reviewRunning ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.85)',
              fontSize: 11, fontWeight: 600, cursor: reviewRunning ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!reviewRunning) Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(167,139,250,0.18)', borderColor: 'rgba(167,139,250,0.5)',
              })
            }}
            onMouseLeave={(e) => {
              if (!reviewRunning) Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.3)',
              })
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2.5 5.5L18 10l-5.5 2.5L10 18l-2.5-5.5L2 10l5.5-2.5L10 2z" fill="currentColor"/>
            </svg>
            {reviewRunning ? 'Review running...' : 'AI Review'}
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* File list sidebar */}
        <div style={{
          width: sidebarWidth, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px',
            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            Changed files
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {loading ? (
              <div style={{ padding: '20px 12px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                Loading...
              </div>
            ) : error ? (
              <div style={{ padding: '12px', fontSize: 11, color: 'rgba(239,68,68,0.8)' }}>
                {error}
              </div>
            ) : files.length === 0 ? (
              <div style={{ padding: '20px 12px', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                No changes found
              </div>
            ) : (
              files.map((file) => {
                const isActive = file.path === selectedFile
                const fileName = file.path.split('/').pop() ?? file.path
                const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
                const statusColor = STATUS_COLOR[file.status] ?? 'rgba(255,255,255,0.5)'
                const fileComments = allComments.filter((c) => c.file === file.path)
                const commentCount = fileComments.length

                return (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(167,139,250,0.08)' : 'transparent',
                      borderLeft: isActive ? '2px solid rgba(167,139,250,0.6)' : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Status badge */}
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: statusColor,
                        width: 14, textAlign: 'center', flexShrink: 0,
                        fontFamily: 'monospace',
                      }}>
                        {file.status}
                      </span>
                      {/* File name */}
                      <span style={{
                        fontSize: 12, color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)',
                        fontWeight: isActive ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1, minWidth: 0,
                      }}>
                        {fileName}
                      </span>
                      {/* Stats + comment count */}
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        {file.additions > 0 && (
                          <span style={{ fontSize: 10, color: '#73c991', fontFamily: 'monospace' }}>+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span style={{ fontSize: 10, color: '#f44747', fontFamily: 'monospace' }}>-{file.deletions}</span>
                        )}
                        {commentCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: '#a78bfa',
                            background: 'rgba(167,139,250,0.15)', borderRadius: 8,
                            padding: '0 5px', lineHeight: '16px', minWidth: 16, textAlign: 'center',
                          }}>
                            {commentCount}
                          </span>
                        )}
                      </span>
                    </div>
                    {dirPath && (
                      <div style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 1, marginLeft: 20,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {dirPath}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onResizeStart}
          style={{
            width: 4, cursor: 'col-resize', flexShrink: 0,
            background: 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(167,139,250,0.2)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        />

        {/* Diff viewer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedFile ? (
            <>
              {/* File header */}
              <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: STATUS_COLOR[files.find(f => f.path === selectedFile)?.status ?? 'M'] ?? 'rgba(255,255,255,0.5)',
                  padding: '1px 5px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.06)',
                  fontFamily: 'monospace',
                }}>
                  {STATUS_LABEL[files.find(f => f.path === selectedFile)?.status ?? 'M'] ?? 'Changed'}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>
                  {selectedFile}
                </span>
              </div>

              {/* Diff editor with inline review comments */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {fileLoading ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 12,
                  }}>
                    Loading diff...
                  </div>
                ) : (
                  <InlineDiffWithComments
                    key={selectedFile}
                    file={selectedFile}
                    language={getLang(selectedFile)}
                    original={originalContent}
                    modified={modifiedContent}
                    comments={allComments.filter((c) => c.file === selectedFile)}
                  />
                )}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
            }}>
              {loading ? (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading...</span>
              ) : files.length === 0 ? (
                <>
                  <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 1v14M1 8h14" />
                  </svg>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No changes between this branch and main</span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Select a file to view changes</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
