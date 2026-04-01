/**
 * GitOverlay — a floating git panel anchored to the bottom-left of the canvas area.
 * It appears whenever the focused node has a detectable git repository,
 * and provides: branch info, changed-file links, stage-all, commit, and push.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, ArrowUpFromLine, GitCommitHorizontal, GitPullRequestArrow, Plus, Minus, X, ChevronDown, ChevronUp, Loader2, Check, AlertCircle, Undo2 } from 'lucide-react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
// Extension → Monaco language ID
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', markdown: 'markdown',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml', tf: 'hcl', lua: 'lua',
}
function fileLang(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function joinPath(base: string, rel: string): string {
  return base.replace(/\/$/, '') + '/' + rel
}

// ─── Inject keyframes once ────────────────────────────────────────────────────
let _injected = false
function injectStyles() {
  if (_injected) return
  _injected = true
  const s = document.createElement('style')
  s.textContent = `
    @keyframes git-slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes git-slide-down {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(12px); }
    }
    @keyframes git-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes git-pop-in {
      from { opacity: 0; transform: scale(0.95) translateY(4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
  `
  document.head.appendChild(s)
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GitFile {
  path: string
  index: string
  working: string
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
}

type ActionState = 'idle' | 'loading' | 'success' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a usable working-directory path from a focused node */
function getNodePath(node: { type: string; props: Record<string, unknown> }): string | null {
  if (node.type === 'terminal') return (node.props.cwd as string) || null
  if (node.type === 'monaco')   return (node.props.rootPath as string) || null
  if (node.type === 'files')    return (node.props.rootPath as string) || null
  return null
}

/** Color-code a file status character */
function statusColor(ch: string): string {
  if (ch === 'M') return '#fbbf24'   // modified — amber
  if (ch === 'A') return '#4ade80'   // added — green
  if (ch === 'D') return '#f87171'   // deleted — red
  if (ch === 'R') return '#60a5fa'   // renamed — blue
  if (ch === '?') return 'rgba(255,255,255,0.35)'  // untracked
  return 'rgba(255,255,255,0.4)'
}

function statusLabel(f: GitFile): string {
  const i = f.index.trim()
  const w = f.working.trim()
  if (i === '?' && w === '?') return 'U'    // untracked
  if (i !== '' && i !== ' ') return i       // staged status
  return w || ' '
}

function statusChar(f: GitFile): { char: string; color: string; staged: boolean } {
  const i = f.index.trim()
  const w = f.working.trim()
  const staged = i !== '' && i !== ' ' && i !== '?'
  const ch = staged ? i : (w !== '' ? w : ' ')
  return { char: ch, color: statusColor(ch), staged }
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

function fileDir(filePath: string): string {
  const i = filePath.lastIndexOf('/')
  return i >= 0 ? filePath.slice(0, i) : ''
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface FileRowProps {
  file: GitFile
  gitPath: string
  onOpenDiff: (filePath: string, gitPath: string) => void
  onStage: (filePath: string) => void
  onUnstage: (filePath: string) => void
  onDiscard: (filePath: string) => void
}

function FileRow({ file, gitPath, onOpenDiff, onStage, onUnstage, onDiscard }: FileRowProps): React.ReactElement {
  const { char, color, staged } = statusChar(file)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={() => onOpenDiff(file.path, gitPath)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={file.path}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 8px 4px 12px',
        cursor: 'pointer',
        background: hovered
          ? staged ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)'
          : staged ? 'rgba(74,222,128,0.04)' : 'transparent',
        transition: 'background 0.1s ease',
        minWidth: 0,
      }}
    >
      {/* Status badge */}
      <span style={{
        width: 16, height: 16,
        borderRadius: 4,
        background: color + '22',
        border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9,
        fontWeight: 700,
        color,
        flexShrink: 0,
        fontFamily: 'ui-monospace, Menlo, monospace',
        letterSpacing: 0,
        opacity: staged ? 1 : 0.75,
      }}>
        {char}
      </span>

      {/* Filename — never truncated */}
      <span style={{
        fontSize: 11,
        color: hovered ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.72)',
        fontFamily: 'ui-monospace, Menlo, monospace',
        flexShrink: 0,
        transition: 'color 0.1s ease',
      }}>
        {fileName(file.path)}
      </span>

      {/* Directory — dim, truncates on the right */}
      {fileDir(file.path) && (
        <span style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.28)',
          fontFamily: 'ui-monospace, Menlo, monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}
          title={file.path}
        >
          {fileDir(file.path)}
        </span>
      )}

      {/* Action buttons — pushed to far right */}
      <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        {hovered && !staged ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!confirm(`Discard changes to ${fileName(file.path)}?`)) return
              onDiscard(file.path)
            }}
            title="Discard change"
            style={{
              width: 20, height: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 5,
              cursor: 'pointer',
              color: '#f87171',
              padding: 0,
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.22)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)' }}
          >
            <Undo2 size={11} />
          </button>
        ) : null}
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hovered ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                staged ? onUnstage(file.path) : onStage(file.path)
              }}
              title={staged ? 'Unstage file' : 'Stage file'}
              style={{
                width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: staged ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)',
                border: `1px solid ${staged ? 'rgba(251,191,36,0.3)' : 'rgba(74,222,128,0.3)'}`,
                borderRadius: 5,
                cursor: 'pointer',
                color: staged ? '#fbbf24' : '#4ade80',
                padding: 0,
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = staged ? 'rgba(251,191,36,0.22)' : 'rgba(74,222,128,0.22)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = staged ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)'
              }}
            >
              {staged ? <Minus size={11} /> : <Plus size={11} />}
            </button>
          ) : staged ? (
            <span style={{
              fontSize: 9,
              color: '#4ade80',
              background: '#4ade8018',
              border: '1px solid #4ade8033',
              borderRadius: 3,
              padding: '1px 4px',
              fontFamily: 'ui-monospace, Menlo, monospace',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}>
              ✓
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface ActionButtonProps {
  onClick: () => void
  disabled?: boolean
  state?: ActionState
  icon: React.ReactNode
  label: string
  accent?: string
  badge?: number
}

function ActionButton({ onClick, disabled, state = 'idle', icon, label, accent, badge }: ActionButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  const isError = state === 'error'
  const isDisabled = disabled || isLoading

  const bg = isError
    ? 'rgba(248,113,113,0.12)'
    : isSuccess
      ? 'rgba(74,222,128,0.12)'
      : hovered && !isDisabled
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(255,255,255,0.04)'

  const border = isError
    ? '1px solid rgba(248,113,113,0.3)'
    : isSuccess
      ? '1px solid rgba(74,222,128,0.3)'
      : `1px solid rgba(255,255,255,${hovered && !isDisabled ? '0.12' : '0.07'})`

  const color = isError
    ? '#f87171'
    : isSuccess
      ? '#4ade80'
      : isDisabled
        ? 'rgba(255,255,255,0.2)'
        : accent ?? 'rgba(255,255,255,0.65)'

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '6px 8px',
        background: bg,
        border,
        borderRadius: 7,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        color,
        fontSize: 11,
        fontWeight: 500,
        transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
        outline: 'none',
        letterSpacing: '0.01em',
      }}
    >
      {isLoading
        ? <Loader2 size={12} style={{ animation: 'git-spin 0.8s linear infinite', flexShrink: 0 }} />
        : isSuccess
          ? <Check size={12} style={{ flexShrink: 0 }} />
          : isError
            ? <AlertCircle size={12} style={{ flexShrink: 0 }} />
            : <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      }
      <span>{isSuccess ? 'Done' : isError ? 'Error' : label}</span>
      {badge != null && badge > 0 && !isLoading && !isSuccess && !isError && (
        <span style={{
          position: 'absolute',
          top: -5, right: -5,
          minWidth: 16, height: 16,
          padding: '0 4px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 9,
          fontWeight: 600,
          fontFamily: 'ui-monospace, Menlo, monospace',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          boxSizing: 'border-box',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Commit Modal ─────────────────────────────────────────────────────────────

interface CommitModalProps {
  gitPath: string
  onClose: () => void
  onCommitted: () => void
}

function CommitModal({ gitPath, onClose, onCommitted }: CommitModalProps): React.ReactElement {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<ActionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const commit = async () => {
    if (!message.trim() || state === 'loading') return
    setState('loading')
    setError(null)
    try {
      await window.git.commit(gitPath, message.trim())
      setState('success')
      setTimeout(() => {
        onCommitted()
        onClose()
      }, 800)
    } catch (e: any) {
      setState('error')
      setError(e?.message ?? 'Commit failed')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    /* Backdrop */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: 400,
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        animation: 'git-pop-in 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitCommitHorizontal size={14} color='rgba(255,255,255,0.5)' />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>
              Commit changes
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', padding: 2, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Commit message…'
            rows={4}
            style={{
              width: '100%',
              background: '#0d0d0d',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 13,
              fontFamily: 'ui-monospace, Menlo, monospace',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          {error && (
            <div style={{
              marginTop: 8, fontSize: 11,
              color: '#f87171',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>
              {error}
            </div>
          )}
          <div style={{
            display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', flex: 1 }}>
              ⌘↵ to commit
            </span>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!message.trim() || state === 'loading'}
              style={{
                padding: '6px 16px',
                background: state === 'success' ? '#4ade8022' : '#a78bfa22',
                border: `1px solid ${state === 'success' ? '#4ade8044' : '#a78bfa44'}`,
                borderRadius: 7,
                color: state === 'success' ? '#4ade80' : '#a78bfa',
                cursor: (!message.trim() || state === 'loading') ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 500,
                opacity: !message.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              {state === 'loading' && <Loader2 size={12} style={{ animation: 'git-spin 0.8s linear infinite' }} />}
              {state === 'success' ? 'Committed!' : 'Commit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Branch Dropdown ──────────────────────────────────────────────────────────

interface BranchEntry {
  name: string
  author: string
  subject: string
  timeAgo: string
  isCurrent: boolean
}

interface BranchDropdownProps {
  gitPath: string
  currentBranch: string
  onClose: () => void
  onCheckedOut: () => void
}

function BranchDropdown({ gitPath, currentBranch, onClose, onCheckedOut }: BranchDropdownProps): React.ReactElement {
  const [branches, setBranches] = useState<BranchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.git.branches(gitPath)
      .then(all => {
        // Show last 5 recent branches (excluding current) + ensure main/master is included
        const nonCurrent = all.filter(b => !b.isCurrent)
        const mainBranch = nonCurrent.find(b => b.name === 'main' || b.name === 'master')
        const recent = nonCurrent.filter(b => b.name !== 'main' && b.name !== 'master').slice(0, 5)
        const result: BranchEntry[] = []
        if (mainBranch) result.push(mainBranch)
        for (const b of recent) {
          if (!result.find(r => r.name === b.name)) result.push(b)
        }
        setBranches(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [gitPath])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const checkout = async (name: string) => {
    try {
      await window.git.checkoutBranch(gitPath, name, false)
      onCheckedOut()
      onClose()
    } catch (e) {
      console.error('[BranchDropdown] checkout failed:', e)
    }
  }

  // Positioned absolutely on the page: above the overlay panel, anchored bottom-left
  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        bottom: 20,       // overlay is at bottom:20
        left: 16,         // overlay is at left:16
        marginBottom: 4,  // small gap above the overlay
        width: 320,
        background: 'rgba(18, 18, 18, 0.98)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        animation: 'git-pop-in 0.15s ease',
        zIndex: 600,
      }}
    >
      {/* Header label */}
      <div style={{
        padding: '8px 12px 6px',
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'ui-monospace, Menlo, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        Switch branch
      </div>

      {loading ? (
        <div style={{ padding: '12px', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          Loading…
        </div>
      ) : branches.length === 0 ? (
        <div style={{ padding: '12px', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          No other branches
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
          {branches.map(b => (
            <BranchRow key={b.name} branch={b} onClick={() => checkout(b.name)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BranchRow({ branch, onClick }: { branch: BranchEntry; onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const isMain = branch.name === 'main' || branch.name === 'master'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      <GitBranch size={11} color={isMain ? '#4ade80' : 'rgba(255,255,255,0.35)'} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 11,
        fontWeight: isMain ? 600 : 400,
        color: isMain ? '#4ade80' : (hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'),
        fontFamily: 'ui-monospace, Menlo, monospace',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'color 0.1s ease',
      }}>
        {branch.name}
      </span>
      <span style={{
        fontSize: 9,
        color: 'rgba(255,255,255,0.2)',
        fontFamily: 'ui-monospace, Menlo, monospace',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {branch.timeAgo}
      </span>
    </div>
  )
}

// ─── Main GitOverlay component ────────────────────────────────────────────────

export function GitOverlay(): React.ReactElement | null {
  useEffect(() => { injectStyles() }, [])

  const { focusedNodeId, nodes } = useNodeStore()
  const focusedNode = focusedNodeId ? nodes.get(focusedNodeId) : null
  const gitPath = focusedNode ? getNodePath(focusedNode) : null

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [isRepo, setIsRepo] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [stageState, setStageState] = useState<ActionState>('idle')
  const [unstageState, setUnstageState] = useState<ActionState>('idle')
  const [pushState, setPushState] = useState<ActionState>('idle')
  const [visible, setVisible] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPathRef = useRef<string | null>(null)

  const fetchStatus = useCallback(async (path: string) => {
    try {
      const s = await window.git.status(path)
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }, [])

  // When gitPath changes, check if it's a repo and start polling
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

    if (!gitPath) {
      setVisible(false)
      setIsRepo(false)
      setStatus(null)
      prevPathRef.current = null
      return
    }

    if (gitPath === prevPathRef.current) return
    prevPathRef.current = gitPath

    // Check if it's a git repo
    window.git.isRepo(gitPath).then((yes) => {
      if (!yes) {
        setVisible(false)
        setIsRepo(false)
        setStatus(null)
        return
      }
      setIsRepo(true)
      setVisible(true)
      fetchStatus(gitPath)
      pollRef.current = setInterval(() => fetchStatus(gitPath), 3000)
      window.git.remoteUrl(gitPath).then(url => setRemoteUrl(url)).catch(() => setRemoteUrl(null))
    })

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [gitPath, fetchStatus])

  // ── Actions ───────────────────────────────────────────────────────────────

  const stageAll = async () => {
    if (!gitPath || !status || stageState === 'loading') return
    setStageState('loading')
    try {
      const unstaged = status.files.map((f) => f.path)
      await window.git.stage(gitPath, unstaged)
      setStageState('success')
      await fetchStatus(gitPath)
      setTimeout(() => setStageState('idle'), 1500)
    } catch {
      setStageState('error')
      setTimeout(() => setStageState('idle'), 2000)
    }
  }

  const unstageAll = async () => {
    if (!gitPath || !status || unstageState === 'loading') return
    setUnstageState('loading')
    try {
      const staged = status.files
        .filter((f) => f.index.trim() !== '' && f.index.trim() !== ' ' && f.index.trim() !== '?')
        .map((f) => f.path)
      await window.git.unstage(gitPath, staged)
      setUnstageState('success')
      await fetchStatus(gitPath)
      setTimeout(() => setUnstageState('idle'), 1500)
    } catch {
      setUnstageState('error')
      setTimeout(() => setUnstageState('idle'), 2000)
    }
  }

  const push = async () => {
    if (!gitPath || pushState === 'loading') return
    setPushState('loading')
    setPushError(null)
    try {
      const result = await window.git.push(gitPath)
      if (result?.error) {
        setPushState('error')
        setPushError(result.error)
        setTimeout(() => { setPushState('idle'); setPushError(null) }, 3000)
      } else {
        setPushState('success')
        await fetchStatus(gitPath)
        setTimeout(() => setPushState('idle'), 2000)
      }
    } catch (e: any) {
      setPushState('error')
      setPushError(e?.message ?? 'Push failed')
      setTimeout(() => { setPushState('idle'); setPushError(null) }, 3000)
    }
  }

  const openDiff = useCallback(async (filePath: string, rootPath: string) => {
    const lang = fileLang(filePath)
    const fullPath = joinPath(rootPath, filePath)

    // Fetch both sides of the diff in parallel
    const [original, modified] = await Promise.all([
      window.git.fileAtHead(rootPath, filePath).catch(() => null),
      window.fs.readFile(fullPath).catch(() => ''),
    ])

    const { nodes: allNodes, add, update, setFocusedNodeId, bringToFront } = useNodeStore.getState()
    const { camera } = useCameraStore.getState()

    const pendingDiff = { path: fullPath, original, modified, lang }

    // Find existing Monaco node with same rootPath
    const existing = Array.from(allNodes.values()).find(
      (n) => n.type === 'monaco' && n.props.rootPath === rootPath
    )

    if (existing) {
      update(existing.id, { props: { ...existing.props, pendingDiff } })
      bringToFront(existing.id)
      setFocusedNodeId(existing.id)
    } else {
      // Create new Monaco node in the visible canvas area
      const cx = (-camera.x + window.innerWidth * 0.5) / camera.zoom
      const cy = (-camera.y + window.innerHeight * 0.5) / camera.zoom
      const newNode = add('monaco', cx - 500, cy - 320, { rootPath, pendingDiff })
      setFocusedNodeId(newNode.id)
      bringToFront(newNode.id)
    }
  }, [])

  if (!visible || !isRepo || !status || !gitPath) return null

  const hasChanges = status.files.length > 0
  const stagedCount = status.files.filter((f) => {
    const i = f.index.trim()
    return i !== '' && i !== ' ' && i !== '?'
  }).length

  return (
    <>
      {/* Overlay panel */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          width: 406,
          zIndex: 500,
          background: 'rgba(13, 13, 13, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'git-slide-up 0.22s cubic-bezier(0.2, 0, 0, 1)',
          userSelect: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
            position: 'relative',
          }}
        >
          {/* Branch icon + name — clickable to open branch switcher */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setBranchDropdownOpen(o => !o) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
              padding: '2px 6px 2px 2px',
              borderRadius: 6,
              background: branchDropdownOpen ? 'rgba(167,139,250,0.1)' : 'transparent',
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => { if (!branchDropdownOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { if (!branchDropdownOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <GitBranch size={13} color='#a78bfa' style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#a78bfa',
              fontFamily: 'ui-monospace, Menlo, monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {status.branch}
            </span>
            <ChevronDown size={10} color='rgba(167,139,250,0.5)' style={{ flexShrink: 0 }} />
          </div>

          {/* Ahead/behind */}
          {(status.ahead > 0 || status.behind > 0) && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {status.ahead > 0 && (
                <span style={{ fontSize: 10, color: '#4ade80', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  ↑{status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  ↓{status.behind}
                </span>
              )}
            </div>
          )}

          {/* File count badge */}
          {hasChanges && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 4,
              padding: '1px 6px',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>
              {status.files.length}
            </span>
          )}

          {/* Open PRs on GitHub */}
          {remoteUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.app.openExternal(`${remoteUrl}/pulls`)
              }}
              title='Open pull requests on GitHub'
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.35)',
                padding: 0,
                flexShrink: 0,
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
              }}
            >
              <GitPullRequestArrow size={13} />
            </button>
          )}

          {/* Collapse toggle */}
          <span
            onClick={() => setCollapsed((c) => !c)}
            style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>

        </div>

        {/* Body */}
        {!collapsed && (
          <>
            {/* File list */}
            {hasChanges ? (
              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                padding: '4px 0',
                // Subtle scrollbar
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.1) transparent',
              } as React.CSSProperties}>
                {status.files.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    gitPath={gitPath}
                    onOpenDiff={openDiff}
                    onStage={async (fp) => { await window.git.stage(gitPath, [fp]); fetchStatus(gitPath) }}
                    onUnstage={async (fp) => { await window.git.unstage(gitPath, [fp]); fetchStatus(gitPath) }}
                    onDiscard={async (fp) => { await window.git.discard(gitPath, [fp]); fetchStatus(gitPath) }}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: '12px',
                fontSize: 11,
                color: 'rgba(255,255,255,0.25)',
                fontFamily: 'ui-monospace, Menlo, monospace',
                textAlign: 'center',
              }}>
                No changes
              </div>
            )}

            {/* Push error message */}
            {pushError && (
              <div style={{
                padding: '6px 12px',
                fontSize: 10,
                color: '#f87171',
                fontFamily: 'ui-monospace, Menlo, monospace',
                background: 'rgba(248,113,113,0.06)',
                borderTop: '1px solid rgba(248,113,113,0.15)',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}>
                {pushError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              gap: 6,
              padding: '8px 10px 10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <ActionButton
                onClick={stageAll}
                disabled={!hasChanges}
                state={stageState}
                icon={<Plus size={12} />}
                label='Stage all'
                accent='rgba(255,255,255,0.6)'
                badge={hasChanges ? status.files.length : undefined}
              />
              {stagedCount > 0 && (
                <ActionButton
                  onClick={unstageAll}
                  state={unstageState}
                  icon={<Minus size={12} />}
                  label='Unstage'
                  accent='#fbbf24'
                />
              )}
              <ActionButton
                onClick={() => setCommitOpen(true)}
                disabled={stagedCount === 0}
                icon={<GitCommitHorizontal size={12} />}
                label='Commit'
                accent='#a78bfa'
              />
              <ActionButton
                onClick={push}
                state={pushState}
                icon={<ArrowUpFromLine size={12} />}
                label='Push'
                accent={status.ahead > 0 ? '#4ade80' : 'rgba(255,255,255,0.55)'}
              />
            </div>
          </>
        )}
      </div>

      {/* Branch dropdown — rendered outside the overlay to avoid overflow:hidden clipping */}
      {branchDropdownOpen && gitPath && (
        <BranchDropdown
          gitPath={gitPath}
          currentBranch={status.branch}
          onClose={() => setBranchDropdownOpen(false)}
          onCheckedOut={() => fetchStatus(gitPath)}
        />
      )}

      {/* Commit modal */}
      {commitOpen && gitPath && (
        <CommitModal
          gitPath={gitPath}
          onClose={() => setCommitOpen(false)}
          onCommitted={() => fetchStatus(gitPath)}
        />
      )}
    </>
  )
}
