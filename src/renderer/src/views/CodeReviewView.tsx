import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useViewStore } from '../stores/viewStore'
import { useReviewStore } from '../stores/reviewStore'
import { useNodeStore } from '../stores/nodeStore'
import { spawnAgent, findAllClaudeAgentsOnCanvas } from '../../../plugins/kanban/renderer/agentShared'
import { switchCanvas } from '../stores/canvasManager'
import type { ReviewThread } from '../../../modules/servers/canvaflow_mcp/shared/types'
import { FileDiffView } from './codeReview/FileDiffView'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  A: '#73c991',
  M: '#e2c08d',
  D: '#f44747',
  R: '#73c991',
  C: '#73c991',
}

const EMPTY_THREADS: ReviewThread[] = []

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
  const reviewId = activeView?.id ?? ''

  // Review threads from the store (populated by MCP bridge)
  const allThreads = useReviewStore((s) =>
    reviewId ? (s.threads[reviewId] ?? EMPTY_THREADS) : EMPTY_THREADS
  )
  const clearReview = useReviewStore((s) => s.clearReview)

  // Find all claude agents on the worktree canvas. Subscribe to workspaceNodes
  // so the picker re-renders when agents are spawned/removed mid-review.
  const workspaceNodes = useNodeStore((s) => s.workspaceNodes)
  const branchCanvasView = useViewStore((s) =>
    s.instances.find((i) => i.type === 'canvas' && i.worktreePath === worktreePath)
  )
  const agents = React.useMemo(
    () => branchCanvasView ? findAllClaudeAgentsOnCanvas(branchCanvasView.id) : [],
    [branchCanvasView, workspaceNodes],
  )

  const [files, setFiles] = useState<DiffFile[]>([])
  const [mergeBase, setMergeBase] = useState('')
  const [headRef, setHeadRef] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [reviewRunning, setReviewRunning] = useState(false)
  const resizing = useRef(false)

  // ----- Load file list -----
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
      if (result.files.length > 0) {
        setSelectedFile(result.files[0].path)
      }
    }).catch((e) => {
      setError(e?.message ?? String(e))
      setLoading(false)
    })
  }, [worktreePath, branchName])

  // ----- Sidebar resize -----
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

  // ----- AI Review -----
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
      role: 'reviewer',
    })

    // Switch to the canvas so the user can watch the agent work
    switchCanvas(canvasView.id)
  }, [worktreePath, branchName, reviewId])

  // ----- Totals -----
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  // Threads filtered to the selected file
  const fileThreads = selectedFile
    ? allThreads.filter((t) => t.file === selectedFile)
    : EMPTY_THREADS

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
        {allThreads.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#a78bfa',
            background: 'rgba(167,139,250,0.12)', borderRadius: 8,
            padding: '1px 8px', lineHeight: '18px',
          }}>
            {allThreads.length} comment{allThreads.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Clear all threads */}
        {allThreads.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Clear all ${allThreads.length} review comment${allThreads.length === 1 ? '' : 's'}?`)) {
                clearReview(reviewId)
              }
            }}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)',
              color: 'rgba(239,68,68,0.85)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.1s, border-color 0.1s',
            }}
            title="Delete all review threads for this branch"
            onMouseEnter={(e) => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.5)',
              })
            }}
            onMouseLeave={(e) => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)',
              })
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4 4l.5 7a1 1 0 001 1h3a1 1 0 001-1L10 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Clear all
          </button>
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
                const fileCommentCount = allThreads.filter((t) => t.file === file.path).length

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
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: statusColor,
                        width: 14, textAlign: 'center', flexShrink: 0,
                        fontFamily: 'monospace',
                      }}>
                        {file.status}
                      </span>
                      <span style={{
                        fontSize: 12, color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)',
                        fontWeight: isActive ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1, minWidth: 0,
                      }}>
                        {fileName}
                      </span>
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        {file.additions > 0 && (
                          <span style={{ fontSize: 10, color: '#73c991', fontFamily: 'monospace' }}>+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span style={{ fontSize: 10, color: '#f44747', fontFamily: 'monospace' }}>-{file.deletions}</span>
                        )}
                        {fileCommentCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: '#a78bfa',
                            background: 'rgba(167,139,250,0.15)', borderRadius: 8,
                            padding: '0 5px', lineHeight: '16px', minWidth: 16, textAlign: 'center',
                          }}>
                            {fileCommentCount}
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
        {selectedFile && mergeBase && headRef ? (
          <FileDiffView
            key={selectedFile}
            file={selectedFile}
            status={files.find((f) => f.path === selectedFile)?.status ?? 'M'}
            worktreePath={worktreePath}
            baseRef={mergeBase}
            headRef={headRef}
            threads={fileThreads}
            reviewId={reviewId}
            branchName={branchName}
            agents={agents}
          />
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
  )
}
