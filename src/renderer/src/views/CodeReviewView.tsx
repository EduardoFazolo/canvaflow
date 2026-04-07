import React, { useState, useCallback, useEffect, useRef } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useViewStore } from '../stores/viewStore'

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffFile {
  path: string
  status: string
  additions: number
  deletions: number
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
                      {/* Stats */}
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {file.additions > 0 && (
                          <span style={{ fontSize: 10, color: '#73c991', fontFamily: 'monospace' }}>+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span style={{ fontSize: 10, color: '#f44747', fontFamily: 'monospace' }}>-{file.deletions}</span>
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

              {/* Diff editor */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {fileLoading ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 12,
                  }}>
                    Loading diff...
                  </div>
                ) : (
                  <DiffEditor
                    key={selectedFile}
                    height="100%"
                    language={getLang(selectedFile)}
                    original={originalContent}
                    modified={modifiedContent}
                    theme={THEME_NAME}
                    options={DIFF_OPTIONS}
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
