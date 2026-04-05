import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NodeData, useNodeStore } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'

type FsEntry = { name: string; isDir: boolean; size: number; modified: number }
type ViewMode = 'list' | 'grid'

interface Props {
  node: NodeData
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fileColor(name: string, isDir: boolean): string {
  if (isDir) return '#7c9fcb'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return '#f0db4f'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '#8fbcbb'
  if (['md', 'txt', 'rst'].includes(ext)) return '#d8dee9'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return '#a3be8c'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return '#bf616a'
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '#b48ead'
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return '#d08770'
  if (['pdf'].includes(ext)) return '#bf616a'
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return '#88c0d0'
  return 'rgba(255,255,255,0.45)'
}

function FolderIconLarge({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="36" height="30" viewBox="0 0 36 30" fill="none">
      <path d="M2 5C2 3.34 3.34 2 5 2H12L15 6H31C32.66 6 34 7.34 34 9V25C34 26.66 32.66 28 31 28H5C3.34 28 2 26.66 2 25V5Z" fill={color} opacity="0.8"/>
    </svg>
  )
}
function FolderIconSmall({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 2.5C1 1.67 1.67 1 2.5 1H5.5L7 3H13.5C14.33 3 15 3.67 15 4.5V11.5C15 12.33 14.33 13 13.5 13H2.5C1.67 13 1 12.33 1 11.5V2.5Z" fill={color} opacity="0.85"/>
    </svg>
  )
}
function FileIconSmall({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 1H8L12 5V14C12 14.55 11.55 15 11 15H2C1.45 15 1 14.55 1 14V2C1 1.45 1.45 1 2 1Z" fill={color} opacity="0.6" stroke={color} strokeWidth="0.5"/>
      <path d="M8 1V5H12" fill="rgba(0,0,0,0.2)" stroke={color} strokeWidth="0.5" opacity="0.6"/>
    </svg>
  )
}
function FileIconLarge({ color }: { color: string }): React.ReactElement {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
      <path d="M3 1H18L27 10V32C27 32.55 26.55 33 26 33H3C2.45 33 2 32.55 2 32V2C2 1.45 2.45 1 3 1Z" fill={color} opacity="0.5" stroke={color} strokeWidth="1"/>
      <path d="M18 1V10H27" fill="rgba(0,0,0,0.2)" stroke={color} strokeWidth="1" opacity="0.5"/>
    </svg>
  )
}

// Read persisted history from props (stored as JSON string)
function readSavedHistory(props: Record<string, unknown>): string[] {
  try {
    const h = JSON.parse(props.history as string)
    if (Array.isArray(h) && h.length > 0) return h
  } catch {}
  const p = props.path as string
  return p ? [p] : []
}

export function FilesNode({ node }: Props): React.ReactElement {
  const { update } = useNodeStore()

  const savedHistory = readSavedHistory(node.props)
  const [currentPath, setCurrentPath] = useState<string>(savedHistory[savedHistory.length - 1] || '')
  const [viewMode, setViewModeState] = useState<ViewMode>((node.props.viewMode as ViewMode) || 'list')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>(savedHistory)
  const historyRef = useRef<string[]>(savedHistory)
  const scrollRef = useRef<HTMLDivElement>(null)
  const letterJump = useRef<{ letter: string; idx: number }>({ letter: '', idx: -1 })
  const [repoDragOver, setRepoDragOver] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [cloning, setCloning] = useState<string | null>(null)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)

  // Persist props without overwriting other keys
  const persistProps = useCallback((patch: Record<string, unknown>) => {
    const currentProps = useNodeStore.getState().nodes.get(node.id)?.props ?? {}
    update(node.id, { props: { ...currentProps, ...patch } })
  }, [node.id, update])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    persistProps({ viewMode: mode })
  }, [persistProps])

  const loadDir = useCallback(async (dirPath: string, pushHistory: boolean) => {
    if (!dirPath) return
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const result = await window.fs.readDir(dirPath)
      setEntries(result)
      setCurrentPath(dirPath)
      letterJump.current = { letter: '', idx: -1 }
      let newHistory = historyRef.current
      if (pushHistory) {
        newHistory = [...historyRef.current, dirPath]
        historyRef.current = newHistory
        setHistory(newHistory)
      }
      persistProps({
        path: dirPath,
        history: JSON.stringify(newHistory),
        title: dirPath.split('/').pop() || dirPath,
      })
      update(node.id, { title: dirPath.split('/').pop() || dirPath })
    } catch (e: any) {
      setError(e?.message ?? 'Failed to read directory')
    } finally {
      setLoading(false)
    }
  }, [node.id, update, persistProps])

  // Stop wheel events from reaching the canvas native listener
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.stopPropagation()
    }
    el.addEventListener('wheel', stop, { passive: true })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  // Initial load
  useEffect(() => {
    const path = historyRef.current[historyRef.current.length - 1]
    if (path) {
      loadDir(path, false)
    } else {
      window.workspace.homedir().then((home) => {
        historyRef.current = [home]
        setHistory([home])
        loadDir(home, false)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goBack = useCallback(() => {
    const hist = historyRef.current
    if (hist.length <= 1) return
    const newHistory = hist.slice(0, -1)
    historyRef.current = newHistory
    setHistory([...newHistory])
    loadDir(newHistory[newHistory.length - 1], false)
  }, [loadDir])

  const onEntryDoubleClick = useCallback((entry: FsEntry, curPath: string) => {
    if (entry.isDir) {
      loadDir(curPath.replace(/\/$/, '') + '/' + entry.name, true)
    } else {
      window.fs.openFile(curPath.replace(/\/$/, '') + '/' + entry.name)
    }
  }, [loadDir])

  const deleteSelected = useCallback(async (name: string, curPath: string) => {
    const fullPath = curPath.replace(/\/$/, '') + '/' + name
    try {
      await window.fs.delete(fullPath)
      setSelected(null)
      await loadDir(curPath, false)
    } catch (e: any) {
      setCloneError(e?.message ?? 'Delete failed')
    }
  }, [loadDir])

  // Keyboard: letter-jump (cycles through matches) + Delete
  const onListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected) deleteSelected(selected, currentPath)
      return
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const letter = e.key.toLowerCase()
      const matches = entries.filter(en => en.name.toLowerCase().startsWith(letter))
      if (matches.length === 0) return
      let nextIdx: number
      if (letterJump.current.letter === letter) {
        // Same letter — advance to next match, wrap around
        nextIdx = (letterJump.current.idx + 1) % matches.length
      } else {
        // New letter — start from first match
        nextIdx = 0
      }
      letterJump.current = { letter, idx: nextIdx }
      const match = matches[nextIdx]
      setSelected(match.name)
      const el = scrollRef.current?.querySelector(`[data-entry="${CSS.escape(match.name)}"]`) as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [selected, currentPath, entries, deleteSelected])

  const parts = currentPath.split('/').filter(Boolean)
  const breadcrumbParts = ['/', ...parts]

  const onBreadcrumbClick = useCallback((idx: number) => {
    const path = idx === 0 ? '/' : '/' + parts.slice(0, idx).join('/')
    loadDir(path, true)
  }, [parts, loadDir])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setRepoDragOver(false)
    setFileDragOver(false)

    // Handle file drops from another FilesNode
    const filePath = e.dataTransfer.getData('application/canvaflow-file')
    if (filePath) {
      const name = filePath.split('/').pop() || filePath
      setCopying(name)
      setCloneError(null)
      try {
        await window.fs.copy(filePath, currentPath)
        await loadDir(currentPath, false)
      } catch (err: any) {
        setCloneError(err?.message ?? 'Copy failed')
      } finally {
        setCopying(null)
      }
      return
    }

    // Handle repo drops
    const raw = e.dataTransfer.getData('application/canvaflow-repo')
    if (!raw) return
    let repo: { owner: string; repo: string; cloneUrl: string }
    try { repo = JSON.parse(raw) } catch { return }
    setCloneError(null)
    setCloning(repo.repo)
    try {
      await window.git.clone(repo.cloneUrl, currentPath)
      await loadDir(currentPath, false)
    } catch (err: any) {
      setCloneError(err?.message ?? 'Clone failed')
    } finally {
      setCloning(null)
    }
  }, [currentPath, loadDir])

  const onEntryDragStart = useCallback((e: React.DragEvent, entryName: string) => {
    const fullPath = currentPath.replace(/\/$/, '') + '/' + entryName
    e.dataTransfer.setData('application/canvaflow-file', fullPath)
    e.dataTransfer.effectAllowed = 'copy'
  }, [currentPath])

  const tbBtn = (active = false): React.CSSProperties => ({
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    border: 'none', borderRadius: 4,
    color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer', padding: 0, flexShrink: 0,
  })

  return (
    <BaseNode node={node}>
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e0e0e', userSelect: 'none', position: 'relative' }}
        onPointerDown={(e) => { useNodeStore.getState().setFocusedNodeId(node.id); e.stopPropagation() }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/canvaflow-file')) {
            e.preventDefault()
            setFileDragOver(true)
          } else if (e.dataTransfer.types.includes('application/canvaflow-repo')) {
            e.preventDefault()
            setRepoDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setRepoDragOver(false)
            setFileDragOver(false)
          }
        }}
        onDrop={onDrop}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSelected(null) }}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#111', flexShrink: 0,
        }}>
          <button onClick={goBack} disabled={history.length <= 1} title="Back" style={tbBtn()}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button onClick={() => loadDir(currentPath, false)} title="Refresh" style={tbBtn()}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M9.5 5.5A4 4 0 1 1 7 2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M7 1v1.5L8.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Breadcrumb */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            padding: '0 8px', height: 24, minWidth: 0,
          }}>
            {breadcrumbParts.map((part, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 2px', fontSize: 11 }}>/</span>}
                <button
                  onClick={() => onBreadcrumbClick(idx)}
                  style={{
                    background: 'none', border: 'none',
                    color: idx === breadcrumbParts.length - 1 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer', padding: '0 2px', fontSize: 11, fontFamily: 'inherit',
                    whiteSpace: 'nowrap', flexShrink: idx < breadcrumbParts.length - 3 ? 1 : 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: idx < breadcrumbParts.length - 1 ? 80 : 200,
                  }}
                  title={part}
                >
                  {part}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            <button onClick={() => setViewMode('list')} title="List view" style={tbBtn(viewMode === 'list')}>
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M4 1.5h7M4 5h7M4 8.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="1.5" cy="1.5" r="1" fill="currentColor"/>
                <circle cx="1.5" cy="5" r="1" fill="currentColor"/>
                <circle cx="1.5" cy="8.5" r="1" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={() => setViewMode('grid')} title="Grid view" style={tbBtn(viewMode === 'grid')}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="6" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="1" y="6" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="6" y="6" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Column headers — list only */}
        {viewMode === 'list' && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 110px',
            padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
          }}>
            {['Name', 'Size', 'Modified'].map(h => (
              <span key={h} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
        )}

        {/* Content */}
        <div
          ref={scrollRef}
          tabIndex={0}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', outline: 'none' }}
          onKeyDown={onListKeyDown}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          {loading && (
            <div style={{ padding: '24px', color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '16px 12px', color: 'rgba(239,68,68,0.7)', fontSize: 12 }}>{error}</div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div style={{ padding: '24px', color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center' }}>Empty folder</div>
          )}

          {/* List view */}
          {!loading && !error && viewMode === 'list' && entries.map((entry) => {
            const isSelected = selected === entry.name
            const color = fileColor(entry.name, entry.isDir)
            return (
              <div
                key={entry.name}
                data-entry={entry.name}
                draggable
                onDragStart={(e) => onEntryDragStart(e, entry.name)}
                onClick={() => { setSelected(entry.name); scrollRef.current?.focus() }}
                onDoubleClick={() => onEntryDoubleClick(entry, currentPath)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center',
                  padding: '0 12px', height: 30,
                  cursor: entry.isDir ? 'pointer' : 'default',
                  background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent',
                  borderRadius: 4, margin: '1px 4px',
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {entry.isDir ? <FolderIconSmall color={color} /> : <FileIconSmall color={color} />}
                  <span style={{
                    fontSize: 12,
                    color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{entry.name}</span>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontVariantNumeric: 'tabular-nums' }}>
                  {entry.isDir ? '—' : formatSize(entry.size)}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDate(entry.modified)}
                </span>
              </div>
            )
          })}

          {/* Grid view */}
          {!loading && !error && viewMode === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 4, padding: 8 }}>
              {entries.map((entry) => {
                const isSelected = selected === entry.name
                const color = fileColor(entry.name, entry.isDir)
                return (
                  <div
                    key={entry.name}
                    data-entry={entry.name}
                    draggable
                    onDragStart={(e) => onEntryDragStart(e, entry.name)}
                    onClick={() => { setSelected(entry.name); scrollRef.current?.focus() }}
                    onDoubleClick={() => onEntryDoubleClick(entry, currentPath)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'flex-start', gap: 6, padding: '10px 6px 8px',
                      background: isSelected ? 'rgba(139,92,246,0.18)' : 'transparent',
                      borderRadius: 6, cursor: entry.isDir ? 'pointer' : 'default',
                      border: isSelected ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {entry.isDir ? <FolderIconLarge color={color} /> : <FileIconLarge color={color} />}
                    <span style={{
                      fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
                      textAlign: 'center', wordBreak: 'break-word', lineHeight: '1.3',
                      maxHeight: '2.6em', overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{entry.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{
          padding: '4px 12px', borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0, display: 'flex', gap: 8,
        }}>
          <span>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
          {selected && <span>· {selected}</span>}
          {cloneError && <span style={{ color: 'rgba(239,68,68,0.7)', marginLeft: 'auto' }}>{cloneError}</span>}
        </div>

        {/* File drop zone overlay */}
        {fileDragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(139,92,246,0.12)', border: '2px dashed rgba(139,92,246,0.5)',
            borderRadius: 8, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none',
          }}>
            <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
              <path d="M3 1H18L27 10V32C27 32.55 26.55 33 26 33H3C2.45 33 2 32.55 2 32V2C2 1.45 2.45 1 3 1Z" fill="rgba(139,92,246,0.5)" stroke="rgba(139,92,246,0.7)" strokeWidth="1"/>
              <path d="M18 1V10H27" fill="rgba(0,0,0,0.2)" stroke="rgba(139,92,246,0.7)" strokeWidth="1"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(167,139,250,0.9)' }}>Drop to copy here</span>
          </div>
        )}

        {/* Repo drop zone overlay */}
        {repoDragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(139,92,246,0.12)', border: '2px dashed rgba(139,92,246,0.5)',
            borderRadius: 8, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(139,92,246,0.7)">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(167,139,250,0.9)' }}>Drop to clone here</span>
          </div>
        )}

        {/* Copy in progress */}
        {copying && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(139,92,246,0.2)', borderTop: '2px solid rgba(139,92,246,0.8)',
              animation: 'spin 0.8s linear infinite',
            }}/>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Copying <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{copying}</strong>…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Clone in progress */}
        {cloning && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(139,92,246,0.2)', borderTop: '2px solid rgba(139,92,246,0.8)',
              animation: 'spin 0.8s linear infinite',
            }}/>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Cloning <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{cloning}</strong>…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      </div>
    </BaseNode>
  )
}
